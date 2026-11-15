package eu.kanade.tachiyomi.source.model;

import java.io.Serializable;

public interface SManga extends Serializable {
    int UNKNOWN = 0;
    int ONGOING = 1;
    int COMPLETED = 2;
    int LICENSED = 3;
    int PUBLISHING_FINISHED = 4;
    int CANCELLED = 5;
    int ON_HIATUS = 6;

    String getUrl();
    void setUrl(String url);

    String getTitle();
    void setTitle(String title);

    String getArtist();
    void setArtist(String artist);

    String getAuthor();
    void setAuthor(String author);

    String getDescription();
    void setDescription(String description);

    String getGenre();
    void setGenre(String genre);

    int getStatus();
    void setStatus(int status);

    String getThumbnail_url();
    void setThumbnail_url(String thumbnail_url);

    boolean getInitialized();
    void setInitialized(boolean initialized);

    static SManga create() {
        return new SMangaImpl();
    }
}
