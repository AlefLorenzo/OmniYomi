package eu.kanade.tachiyomi.network;

import java.io.IOException;
import okhttp3.MediaType;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import okio.ForwardingSource;
import okio.Source;
import okio.Okio;

public final class ProgressResponseBody extends ResponseBody {
    private final ResponseBody delegate;
    private final ProgressListener listener;
    private final long existingSize;
    private BufferedSource bufferedSource;

    public ProgressResponseBody(ResponseBody delegate, ProgressListener listener, long existingSize) {
        this.delegate = delegate;
        this.listener = listener;
        this.existingSize = existingSize;
    }

    @Override public MediaType contentType() { return delegate.contentType(); }
    @Override public long contentLength() { return delegate.contentLength(); }

    @Override public BufferedSource source() {
        if (bufferedSource == null) bufferedSource = Okio.buffer(source(delegate.source()));
        return bufferedSource;
    }

    private Source source(Source source) {
        return new ForwardingSource(source) {
            long totalRead = existingSize;
            @Override public long read(Buffer sink, long byteCount) throws IOException {
                long read = super.read(sink, byteCount);
                if (read > 0) totalRead += read;
                long bodyLength = delegate.contentLength();
                long totalLength = bodyLength >= 0 ? bodyLength + existingSize : -1L;
                listener.update(totalRead, totalLength, read == -1L);
                return read;
            }
        };
    }
}
