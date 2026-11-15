package eu.kanade.tachiyomi.source.model;

import java.io.Serializable;
import kotlinx.serialization.json.JsonObject;

public interface SChapter extends Serializable {
    Companion Companion = new Companion();

    String getUrl();
    void setUrl(String url);
    String getName();
    void setName(String name);
    long getDate_upload();
    void setDate_upload(long date_upload);
    float getChapter_number();
    void setChapter_number(float chapter_number);
    String getScanlator();
    void setScanlator(String scanlator);
    JsonObject getMemo();
    void setMemo(JsonObject memo);

    default void copyFrom(SChapter other) {
        setName(other.getName());
        setUrl(other.getUrl());
        setDate_upload(other.getDate_upload());
        setChapter_number(other.getChapter_number());
        setScanlator(other.getScanlator());
        setMemo(other.getMemo());
    }

    static SChapter create() { return Companion.create(); }

    final class Companion {
        public SChapter create() { return new SChapterImpl(); }
    }
}
