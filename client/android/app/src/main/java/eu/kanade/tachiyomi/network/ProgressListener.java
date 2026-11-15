package eu.kanade.tachiyomi.network;

/** Receives byte progress for a page image download. */
public interface ProgressListener {
    void update(long bytesRead, long contentLength, boolean done);
}
