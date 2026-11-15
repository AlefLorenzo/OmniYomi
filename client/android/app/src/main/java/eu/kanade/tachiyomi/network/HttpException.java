package eu.kanade.tachiyomi.network;

import java.io.IOException;

public class HttpException extends IOException {
    private final int code;
    public HttpException(int code) {
        super("HTTP " + code);
        this.code = code;
    }
    public int getCode() { return code; }
}
