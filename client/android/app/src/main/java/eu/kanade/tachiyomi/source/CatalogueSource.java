package eu.kanade.tachiyomi.source;

import eu.kanade.tachiyomi.source.model.FilterList;
import eu.kanade.tachiyomi.source.model.MangasPage;
import rx.Observable;

public interface CatalogueSource extends Source {
    boolean getSupportsLatest();
    Observable<MangasPage> fetchPopularManga(int page);
    Observable<MangasPage> fetchSearchManga(int page, String query, FilterList filters);
    Observable<MangasPage> fetchLatestUpdates(int page);
    FilterList getFilterList();
}
