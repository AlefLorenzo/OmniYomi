package eu.kanade.tachiyomi.network;

import android.content.Context;
import com.omniyomi.app.ExtensionRuntimeContext;
import eu.kanade.tachiyomi.network.interceptor.CloudflareInterceptor;
import java.io.File;
import java.util.concurrent.TimeUnit;
import okhttp3.Cache;
import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

/**
 * In-app NetworkHelper compatible with the properties consumed by Mihon extensions.
 * Its OkHttp client uses Android's WebView cookie store and an on-device Cloudflare
 * challenge interceptor; no remote solver or external server is required.
 */
public class NetworkHelper {
    private static final AndroidCookieJar COOKIE_JAR = new AndroidCookieJar();
    private static volatile NetworkHelper defaultInstance;

    private final Context context;
    private volatile OkHttpClient client;

    public NetworkHelper(Context context) {
        if (context == null) throw new IllegalArgumentException("Context obrigatório para NetworkHelper.");
        this.context = context.getApplicationContext();
        synchronized (NetworkHelper.class) {
            if (defaultInstance == null) defaultInstance = this;
        }
    }

    public NetworkHelper() {
        this(ExtensionRuntimeContext.getContext());
    }

    public synchronized OkHttpClient getClient() {
        if (client == null) {
            File cacheDir = new File(context.getCacheDir(), "extension_http_cache");
            if (!cacheDir.exists()) cacheDir.mkdirs();

            OkHttpClient.Builder builder = new OkHttpClient.Builder()
                .cookieJar(COOKIE_JAR)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .callTimeout(2, TimeUnit.MINUTES)
                .followRedirects(true)
                .followSslRedirects(true);

            try {
                builder.cache(new Cache(cacheDir, 8L * 1024L * 1024L));
            } catch (Exception ignored) {
                // Cache is optional; source requests must still work if storage is restricted.
            }

            builder.addInterceptor(new CloudflareInterceptor(
                context,
                COOKIE_JAR,
                this::defaultUserAgentProvider
            ));

            client = builder.build();
        }
        return client;
    }

    public static synchronized OkHttpClient getDefaultClient() {
        if (defaultInstance == null) {
            defaultInstance = new NetworkHelper(ExtensionRuntimeContext.getContext());
        }
        return defaultInstance.getClient();
    }

    /** Kotlin property: NetworkHelper.cookieJar */
    public AndroidCookieJar getCookieJar() { return COOKIE_JAR; }

    /** Deprecated Mihon property; the regular client handles supported CF challenges. */
    public OkHttpClient getCloudflareClient() { return getClient(); }

    public String defaultUserAgentProvider() {
        return "Mozilla/5.0 (Linux; Android 13; OmniYomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    }

    public static Request GET(String url, Headers headers) {
        return new Request.Builder().url(url).headers(headers).build();
    }

    public static Request GET(String url) {
        return new Request.Builder().url(url).build();
    }

    public static Request POST(String url, Headers headers, RequestBody body) {
        return new Request.Builder().url(url).headers(headers).post(body).build();
    }
}
