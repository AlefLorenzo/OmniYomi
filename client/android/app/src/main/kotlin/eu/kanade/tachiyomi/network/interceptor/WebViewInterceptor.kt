package eu.kanade.tachiyomi.network.interceptor

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebSettings
import android.webkit.WebView
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/**
 * Base class for in-process WebView-assisted HTTP challenges. The view is created
 * only after an HTTP response identifies a supported challenge.
 */
abstract class WebViewInterceptor(
    protected val context: Context,
    private val defaultUserAgentProvider: () -> String,
) : Interceptor {

    protected abstract fun shouldIntercept(response: Response): Boolean
    protected abstract fun interceptChallenge(
        chain: Interceptor.Chain,
        request: Request,
        response: Response,
    ): Response

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)
        if (!shouldIntercept(response)) return response
        return interceptChallenge(chain, request, response)
    }

    @SuppressLint("SetJavaScriptEnabled")
    protected fun createWebView(request: Request): WebView =
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.userAgentString = request.header("User-Agent") ?: defaultUserAgentProvider()
            CookieAcceptance.enable(this)
        }

    private object CookieAcceptance {
        @SuppressLint("ObsoleteSdkInt")
        fun enable(view: WebView) {
            android.webkit.CookieManager.getInstance().setAcceptCookie(true)
            android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)
        }
    }
}
