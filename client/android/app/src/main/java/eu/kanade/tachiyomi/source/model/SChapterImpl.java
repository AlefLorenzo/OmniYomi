package eu.kanade.tachiyomi.source.model;

public class SChapterImpl implements SChapter {
    private String url = "";
    private String name = "";
    private long date_upload = 0;
    private float chapter_number = -1;
    private String scanlator = null;

    @Override public String getUrl() { return url; }
    @Override public void setUrl(String url) { this.url = url; }
    @Override public String getName() { return name; }
    @Override public void setName(String name) { this.name = name; }
    @Override public long getDate_upload() { return date_upload; }
    @Override public void setDate_upload(long date_upload) { this.date_upload = date_upload; }
    @Override public float getChapter_number() { return chapter_number; }
    @Override public void setChapter_number(float chapter_number) { this.chapter_number = chapter_number; }
    @Override public String getScanlator() { return scanlator; }
    @Override public void setScanlator(String scanlator) { this.scanlator = scanlator; }
}
