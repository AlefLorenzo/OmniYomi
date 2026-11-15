package eu.kanade.tachiyomi.source.model;

import java.io.Serializable;

public interface SChapter extends Serializable {
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

    static SChapter create() {
        return new SChapterImpl();
    }
}
