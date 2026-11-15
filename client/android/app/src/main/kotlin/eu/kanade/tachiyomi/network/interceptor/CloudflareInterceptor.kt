package eu.kanade.tachiyomi.network.interceptor

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.ContextCompat
import eu.kanade.tachiyomi.network.AndroidCookieJar
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * On-device Cloudflare JS challenge handler. It uses Android WebView and the
 * shared AndroidCookieJar; no remote solver or server is involved.
 *
 * Only non-interactive challenge pages that issue a cf_clearance cookie can be
 * completed automatically. CAPTCHA / interactive challenges remain site restrictions.
 */
class CloudflareInterceptor(
    context: Context,
    private val cookieJar: AndroidCookieJar,
    defaultUserAgentProvider: () -> String,
) : WebViewInterceptor(context.applicationContext, defaultUserAgentProvider) {

    private val mainExecutor = ContextCompat.getMainExecutor(context)
    private val hostLocks = java.util.concurrent.ConcurrentHashMap<String, Any>()

    override fun shouldIntercept(response: Response): Boolean {
        val server = response.header("Server").orEmpty().lowercase()
        return response.header("cf-mitigated") == "challenge" &&
            (server.contains("cloudflare") || server.contains("cloudflare-nginx"))
    }

    override fun interceptChallenge(
        chain: Interceptor.Chain,
        request: Request,
        response: Response,
    ): Response {
        val lock = hostLocks.computeIfAbsent(request.url.host) { Any() }
        synchronized(lock) {
            val before = clearance(request.url)
            response.close()
            if (!hasNewClearance(request.url, before)) {
                solveChallenge(request, before)
            }
            return chain.proceed(request)
        }
    }

    private fun clearance(url: HttpUrl): String? =
        cookieJar.get(url).firstOrNull { it.name == "cf_clearance" }?.value

    private fun hasNewClearance(url: HttpUrl, previous: String?): Boolean {
        val current = clearance(url)
        return !current.isNullOrBlank() && current != previous
    }

    private fun solveChallenge(original: Request, oldClearance: String?) {
        val latch = CountDownLatch(1)
        val solved = AtomicBoolean(false)
        val failed = AtomicBoolean(false)
        val challengeSeen = AtomicBoolean(false)
        val viewRef = java.util.concurrent.atomic.AtomicReference<WebView?>()

        cookieJar.remove(original.url, listOf("cf_clearance"), 0)

        // WebView can only load GET. For POST/API endpoints, solve at the origin root.
        val challengeUrl = if (original.method.equals("GET", true)) {
            original.url.toString()
        } else {
            original.url.newBuilder().encodedPath("/").query(null).fragment(null).build().toString()
        }
        val headers = linkedMapOf<String, String>()
        for (name in original.headers.names()) {
            if (name.equals("Cookie", true) ||
                name.equals("Host", true) ||
                name.equals("Content-Length", true) ||
                name.equals("Connection", true) ||
                name.equals("Accept-Encoding", true)
            ) continue
            val value = original.header(name) ?: continue
            headers[name] = value
        }

        mainExecutor.execute {
            try {
                val webView = createWebView(original)
                viewRef.set(webView)
                webView.webViewClient = object : WebViewClient() {
                    override fun onReceivedHttpError(
                        view: WebView,
                        request: WebResourceRequest,
                        errorResponse: WebResourceResponse,
                    ) {
                        if (!request.isForMainFrame) return
                        val mitigated = errorResponse.responseHeaders?.get("cf-mitigated")
                        if (mitigated == "challenge") {
                            challengeSeen.set(true)
                        } else {
                            failed.set(true)
                            latch.countDown()
                        }
                    }

                    override fun onReceivedError(
                        view: WebView,
                        request: WebResourceRequest,
                        error: android.webkit.WebResourceError,
                    ) {
                        if (request.isForMainFrame) {
                            failed.set(true)
                            latch.countDown()
                        }
                    }

                    override fun onPageFinished(view: WebView, url: String) {
                        if (hasNewClearance(original.url, oldClearance)) {
                            solved.set(true)
                            latch.countDown()
                            return
                        }
                        if (!challengeSeen.get()) {
                            // The origin did not issue a detectable challenge.
                            failed.set(true)
                            latch.countDown()
                        }
                    }
                }
                webView.loadUrl(challengeUrl, headers)
            } catch (_: Throwable) {
                failed.set(true)
                latch.countDown()
            }
        }

        val completed = try {
            latch.await(30, TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }

        mainExecutor.execute {
            viewRef.getAndSet(null)?.let { webView ->
                try {
                    webView.stopLoading()
                    webView.webViewClient = WebViewClient()
                    webView.removeAllViews()
                    webView.destroy()
                } catch (_: Throwable) {
                }
            }
        }

        if (!completed || !solved.get() || failed.get()) {
            cookieJar.remove(original.url, listOf("cf_clearance"), 0)
            val reason = if (challengeSeen.get()) {
                "o desafio Cloudflare exige interação ou não liberou cf_clearance"
            } else {
                "o WebView não conseguiu completar o desafio Cloudflare"
            }
            throw IOException("Não foi possível acessar " + original.url.host + ": " + reason + ".")
        }
    }
}
