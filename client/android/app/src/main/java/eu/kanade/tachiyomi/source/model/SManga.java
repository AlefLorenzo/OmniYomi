package eu.kanade.tachiyomi.source.model;

import java.io.Serializable;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import kotlinx.serialization.json.JsonObject;

public interface SManga extends Serializable {
    int UNKNOWN = 0;
    int ONGOING = 1;
    int COMPLETED = 2;
    int LICENSED = 3;
    int PUBLISHING_FINISHED = 4;
    int CANCELLED = 5;
    int ON_HIATUS = 6;

    Companion Companion = new Companion();

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
    UpdateStrategy getUpdate_strategy();
    void setUpdate_strategy(UpdateStrategy strategy);
    boolean getInitialized();
    void setInitialized(boolean initialized);
    JsonObject getMemo();
    void setMemo(JsonObject memo);

    default List<String> getGenres() {
        String genre = getGenre();
        if (genre == null || genre.trim().isEmpty()) return null;
        return Arrays.asList(genre.split(",\\s*"));
    }

    default SManga copy() {
        SManga copy = create();
        copy.setUrl(getUrl());
        copy.setTitle(getTitle());
        copy.setArtist(getArtist());
        copy.setAuthor(getAuthor());
        copy.setDescription(getDescription());
        copy.setGenre(getGenre());
        copy.setStatus(getStatus());
        copy.setThumbnail_url(getThumbnail_url());
        copy.setUpdate_strategy(getUpdate_strategy());
        copy.setInitialized(getInitialized());
        copy.setMemo(getMemo());
        return copy;
    }

    static SManga create() { return Companion.create(); }

    final class Companion {
        public SManga create() { return new SMangaImpl(); }
    }
}
