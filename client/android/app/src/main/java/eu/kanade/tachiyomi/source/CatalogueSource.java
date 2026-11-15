package eu.kanade.tachiyomi.source;

import eu.kanade.tachiyomi.source.model.FilterList;
import eu.kanade.tachiyomi.source.model.MangasPage;
import kotlin.coroutines.Continuation;
import rx.Observable;

/** Catalogue part of the extensions-lib 1.4/1.6 ABI. */
public interface CatalogueSource extends Source {
    default boolean getSupportsLatest() { return false; }

    default FilterList getFilterList() { return new FilterList(); }

    default Observable<MangasPage> fetchPopularManga(int page) {
        return Observable.error(new UnsupportedOperationException("fetchPopularManga not implemented"));
    }

    default Observable<MangasPage> fetchSearchManga(int page, String query, FilterList filters) {
        return Observable.error(new UnsupportedOperationException("fetchSearchManga not implemented"));
    }

    default Observable<MangasPage> fetchLatestUpdates(int page) {
        return Observable.error(new UnsupportedOperationException("fetchLatestUpdates not implemented"));
    }

    /** Kotlin: suspend fun getPopularManga(page): MangasPage */
    default Object getPopularManga(int page, Continuation<? super MangasPage> continuation) {
        return fetchPopularManga(page).toBlocking().first();
    }

    /** Kotlin: suspend fun getLatestUpdates(page): MangasPage */
    default Object getLatestUpdates(int page, Continuation<? super MangasPage> continuation) {
        return fetchLatestUpdates(page).toBlocking().first();
    }

    /** Kotlin: suspend fun getSearchManga(page, query, filters): MangasPage */
    default Object getSearchManga(
        int page,
        String query,
        FilterList filters,
        Continuation<? super MangasPage> continuation
    ) {
        return fetchSearchManga(page, query, filters).toBlocking().first();
    }
}
