package eu.kanade.tachiyomi.source;

import eu.kanade.tachiyomi.source.model.Page;
import eu.kanade.tachiyomi.source.model.SChapter;
import eu.kanade.tachiyomi.source.model.SManga;
import java.util.List;
import rx.Observable;

public interface Source {
    long getId();
    String getName();
    String getLang();

    Observable<SManga> fetchMangaDetails(SManga manga);
    Observable<List<SChapter>> fetchChapterList(SManga manga);
    Observable<List<Page>> fetchPageList(SChapter chapter);
}
