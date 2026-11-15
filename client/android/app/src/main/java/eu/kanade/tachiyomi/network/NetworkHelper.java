package eu.kanade.tachiyomi.network;

import java.util.concurrent.TimeUnit;
import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

public class NetworkHelper {
    private static OkHttpClient client;

    public synchronized OkHttpClient getClient() {
        if (client == null) {
            client = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
        }
        return getSharedClient();
    }

    public static synchronized OkHttpClient getDefaultClient() { return getSharedClient(); }

    private static synchronized OkHttpClient getSharedClient() {
        if (client == null) {
            client = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
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
