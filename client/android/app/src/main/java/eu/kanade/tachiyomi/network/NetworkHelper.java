package eu.kanade.tachiyomi.network;

import java.util.concurrent.TimeUnit;
import okhttp3.Headers;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.HttpUrl;
import java.util.concurrent.ConcurrentHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

public class NetworkHelper {
    private static OkHttpClient client;
    private static final CookieJar COOKIE_JAR = new CookieJar() {
        private final Map<String, List<Cookie>> cookies = new ConcurrentHashMap<>();

        @Override public void saveFromResponse(HttpUrl url, List<Cookie> received) {
            List<Cookie> existing = new ArrayList<>(cookies.getOrDefault(url.host(), new ArrayList<>()));
            long now = System.currentTimeMillis();
            existing.removeIf(cookie -> cookie.expiresAt() <= now || received.stream().anyMatch(
                fresh -> fresh.name().equals(cookie.name()) && fresh.domain().equals(cookie.domain())
                    && fresh.path().equals(cookie.path())
            ));
            for (Cookie cookie : received) if (cookie.expiresAt() > now) existing.add(cookie);
            if (existing.isEmpty()) cookies.remove(url.host());
            else cookies.put(url.host(), existing);
        }

        @Override public List<Cookie> loadForRequest(HttpUrl url) {
            long now = System.currentTimeMillis();
            List<Cookie> stored = cookies.getOrDefault(url.host(), new ArrayList<>());
            List<Cookie> valid = new ArrayList<>();
            for (Cookie cookie : stored) {
                if (cookie.expiresAt() > now && cookie.matches(url)) valid.add(cookie);
            }
            return valid;
        }
    };

    public synchronized OkHttpClient getClient() { return getSharedClient(); }

    public static synchronized OkHttpClient getDefaultClient() { return getSharedClient(); }

    private static synchronized OkHttpClient getSharedClient() {
        if (client == null) {
            client = new OkHttpClient.Builder()
                .cookieJar(COOKIE_JAR)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .callTimeout(2, TimeUnit.MINUTES)
                .writeTimeout(60, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
        }
        return client;
    }

    public String defaultUserAgentProvider() {
        return "Mozilla/5.0 (Linux; Android 13; OmniYomi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    }

    /** Kotlin property accessors expected by Mihon extensions. */
    public CookieJar getCookieJar() { return COOKIE_JAR; }

    /** Deprecated Mihon property; the regular client is the supported client. */
    public OkHttpClient getCloudflareClient() { return getClient(); }


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
