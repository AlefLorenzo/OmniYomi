package eu.kanade.tachiyomi.network;

import java.util.concurrent.TimeUnit;
import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;

public class NetworkHelper {
    private static OkHttpClient client;

    public static synchronized OkHttpClient getClient() {
        if (client == null) {
            client = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
        }
        return client;
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
