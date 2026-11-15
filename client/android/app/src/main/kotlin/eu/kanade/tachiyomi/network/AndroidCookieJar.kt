package eu.kanade.tachiyomi.network

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * Uses Android's shared WebView cookie store so cookies created by Cloudflare/WebView
 * challenges are also available to OkHttp requests from source extensions.
 */
class AndroidCookieJar : CookieJar {
    private val manager: CookieManager by lazy { CookieManager.getInstance() }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val urlString = url.toString()
        cookies.forEach { manager.setCookie(urlString, it.toString()) }
        manager.flush()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = get(url)

    fun get(url: HttpUrl): List<Cookie> {
        val raw = manager.getCookie(url.toString()) ?: return emptyList()
        return raw.split(";").mapNotNull { Cookie.parse(url, it.trim()) }
    }

    fun remove(url: HttpUrl, cookieNames: List<String>? = null, maxAge: Int = -1): Int {
        val urlString = url.toString()
        val raw = manager.getCookie(urlString) ?: return 0
        val names = raw.split(";").map { it.trim().substringBefore("=") }
        val selected = if (cookieNames == null) names else names.filter { it in cookieNames }
        selected.forEach { manager.setCookie(urlString, "$it=; Max-Age=$maxAge; Path=/") }
        manager.flush()
        return selected.size
    }

    fun removeAll() {
        manager.removeAllCookies(null)
        manager.flush()
    }
}
