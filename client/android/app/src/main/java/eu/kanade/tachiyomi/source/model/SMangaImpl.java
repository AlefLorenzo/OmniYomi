package eu.kanade.tachiyomi.source.model;

public class SMangaImpl implements SManga {
    private String url = "";
    private String title = "";
    private String artist = null;
    private String author = null;
    private String description = null;
    private String genre = null;
    private int status = UNKNOWN;
    private String thumbnail_url = null;
    private boolean initialized = false;

    @Override public String getUrl() { return url; }
    @Override public void setUrl(String url) { this.url = url; }
    @Override public String getTitle() { return title; }
    @Override public void setTitle(String title) { this.title = title; }
    @Override public String getArtist() { return artist; }
    @Override public void setArtist(String artist) { this.artist = artist; }
    @Override public String getAuthor() { return author; }
    @Override public void setAuthor(String author) { this.author = author; }
    @Override public String getDescription() { return description; }
    @Override public void setDescription(String description) { this.description = description; }
    @Override public String getGenre() { return genre; }
    @Override public void setGenre(String genre) { this.genre = genre; }
    @Override public int getStatus() { return status; }
    @Override public void setStatus(int status) { this.status = status; }
    @Override public String getThumbnail_url() { return thumbnail_url; }
    @Override public void setThumbnail_url(String thumbnail_url) { this.thumbnail_url = thumbnail_url; }
    @Override public boolean getInitialized() { return initialized; }
    @Override public void setInitialized(boolean initialized) { this.initialized = initialized; }
}
