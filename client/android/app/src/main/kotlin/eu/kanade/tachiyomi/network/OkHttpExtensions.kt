package eu.kanade.tachiyomi.network

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Request
import okhttp3.Response
import rx.Observable
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

fun Call.asObservable(): Observable<Response> = Observable.create { subscriber ->
    val clone = clone()
    subscriber.add(object : rx.Subscription {
        override fun unsubscribe() { clone.cancel() }
        override fun isUnsubscribed(): Boolean = clone.isCanceled
    })
    try {
        if (!subscriber.isUnsubscribed) {
            val response = clone.execute()
            if (!subscriber.isUnsubscribed) {
                subscriber.onNext(response)
                subscriber.onCompleted()
            } else {
                response.close()
            }
        }
    } catch (error: Throwable) {
        if (!subscriber.isUnsubscribed) subscriber.onError(error)
    }
}

fun Call.asObservableSuccess(): Observable<Response> = asObservable().map { response ->
    if (!response.isSuccessful) {
        val code = response.code
        response.close()
        throw HttpException(code)
    }
    response
}

suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, error: IOException) {
            if (continuation.isActive) continuation.resumeWithException(error)
        }

        override fun onResponse(call: Call, response: Response) {
            if (continuation.isActive) {
                continuation.resume(response) { _, value, _ -> value.close() }
            } else {
                response.close()
            }
        }
    })
}

suspend fun Call.awaitSuccess(): Response {
    val response = await()
    if (!response.isSuccessful) {
        val code = response.code
        response.close()
        throw HttpException(code)
    }
    return response
}

fun okhttp3.OkHttpClient.newCachelessCallWithProgress(
    request: Request,
    listener: ProgressListener,
    existingSize: Long = 0L,
): Call {
    val progressClient = newBuilder()
        .cache(null)
        .addNetworkInterceptor { chain ->
            val requestWithRange = chain.request().newBuilder().apply {
                if (existingSize > 0L && chain.request().header("Range") == null) {
                    header("Range", "bytes=$existingSize-")
                }
            }.build()
            val response = chain.proceed(requestWithRange)
            val offset = if (response.code == 206) existingSize else 0L
            response.newBuilder()
                .body(ProgressResponseBody(response.body, listener, offset))
                .build()
        }
        .build()
    return progressClient.newCall(request)
}
