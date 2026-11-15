package eu.kanade.tachiyomi.source.model;

import java.util.List;

/** Result returned by the extensions-lib 1.6 suspend update contract. */
public final class SMangaUpdate {
    private final SManga manga;
    private final List<SChapter> chapters;

    public SMangaUpdate(SManga manga, List<SChapter> chapters) {
        this.manga = manga;
        this.chapters = chapters;
    }

    public SManga getManga() { return manga; }
    public List<SChapter> getChapters() { return chapters; }
}
