package eu.kanade.tachiyomi.source.model;

import android.net.Uri;

public class Page {
    public static final int READY = 0;
    public static final int QUEUE = 1;
    public static final int LOAD_PAGE = 2;
    public static final int DOWNLOAD_IMAGE = 3;
    public static final int COMPLETE = 4;
    public static final int ERROR = 5;

    private int index;
    private String url;
    private String imageUrl;
    private transient Uri uri;
    private int status = QUEUE;
    private transient int progress = 0;

    public Page(int index, String url, String imageUrl, Uri uri) {
        this.index = index;
        this.url = url;
        this.imageUrl = imageUrl;
        this.uri = uri;
    }

    public Page(int index, String url, String imageUrl) {
        this(index, url, imageUrl, null);
    }

    public Page(int index, String url) {
        this(index, url, null, null);
    }

    public Page(int index) {
        this(index, "", null, null);
    }

    public int getIndex() { return index; }
    public String getUrl() { return url; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public Uri getUri() { return uri; }
    public void setUri(Uri uri) { this.uri = uri; }
    public int getStatus() { return status; }
    public void setStatus(int status) { this.status = status; }
    public int getProgress() { return progress; }
    public void setProgress(int progress) { this.progress = progress; }
}
