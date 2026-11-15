package eu.kanade.tachiyomi.source.online;

import eu.kanade.tachiyomi.network.NetworkHelper;
import eu.kanade.tachiyomi.source.CatalogueSource;
import eu.kanade.tachiyomi.source.model.FilterList;
import eu.kanade.tachiyomi.source.model.MangasPage;
import eu.kanade.tachiyomi.source.model.Page;
import eu.kanade.tachiyomi.source.model.SChapter;
import eu.kanade.tachiyomi.source.model.SManga;
import java.security.MessageDigest;
import java.util.List;
import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import rx.Observable;
import rx.Subscriber;

public abstract class HttpSource implements CatalogueSource {
    public abstract String getBaseUrl();
    public abstract String getName();
    public abstract String getLang();
    public boolean getSupportsLatest() { return false; }

    @Override
    public long getId() {
        String key = getName() + "/" + getLang() + "/1";
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] bytes = md.digest(key.getBytes("UTF-8"));
            long val = 0;
            for (int i = 0; i < 8; i++) {
                val = (val << 8) | (bytes[i] & 0xff);
            }
            return Math.abs(val);
        } catch (Exception e) {
            return (long) key.hashCode();
        }
    }

    public Headers getHeaders() {
        return headersBuilder().build();
    }

    public Headers.Builder headersBuilder() {
        return new Headers.Builder()
            .add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    }

    public OkHttpClient getClient() {
        return NetworkHelper.getClient();
    }

    public FilterList getFilterList() {
        return new FilterList();
    }

    public abstract Request popularMangaRequest(int page);
    public abstract MangasPage popularMangaParse(Response response) throws Exception;

    public abstract Request searchMangaRequest(int page, String query, FilterList filters);
    public abstract MangasPage searchMangaParse(Response response) throws Exception;

    public Request latestUpdatesRequest(int page) {
        return popularMangaRequest(page);
    }
    public MangasPage latestUpdatesParse(Response response) throws Exception {
        return popularMangaParse(response);
    }

    public abstract Request mangaDetailsRequest(SManga manga);
    public abstract SManga mangaDetailsParse(Response response) throws Exception;

    public abstract Request chapterListRequest(SManga manga);
    public abstract List<SChapter> chapterListParse(Response response) throws Exception;

    public abstract Request pageListRequest(SChapter chapter);
    public abstract List<Page> pageListParse(Response response) throws Exception;

    public Request imageUrlRequest(Page page) {
        return new Request.Builder().url(page.getUrl()).headers(getHeaders()).build();
    }
    public String imageUrlParse(Response response) throws Exception {
        return "";
    }

    @Override
    public Observable<MangasPage> fetchPopularManga(final int page) {
        return Observable.create(new Observable.OnSubscribe<MangasPage>() {
            @Override
            public void call(Subscriber<? super MangasPage> subscriber) {
                try {
                    Request req = popularMangaRequest(page);
                    Response res = getClient().newCall(req).execute();
                    MangasPage mangasPage = popularMangaParse(res);
                    subscriber.onNext(mangasPage);
                    subscriber.onCompleted();
                } catch (Throwable t) {
                    subscriber.onError(t);
                }
            }
        });
    }

    @Override
    public Observable<MangasPage> fetchSearchManga(final int page, final String query, final FilterList filters) {
        return Observable.create(new Observable.OnSubscribe<MangasPage>() {
            @Override
            public void call(Subscriber<? super MangasPage> subscriber) {
                try {
                    Request req = searchMangaRequest(page, query, filters);
                    Response res = getClient().newCall(req).execute();
                    MangasPage mangasPage = searchMangaParse(res);
                    subscriber.onNext(mangasPage);
                    subscriber.onCompleted();
                } catch (Throwable t) {
                    subscriber.onError(t);
                }
            }
        });
    }

    @Override
    public Observable<MangasPage> fetchLatestUpdates(final int page) {
        return Observable.create(new Observable.OnSubscribe<MangasPage>() {
            @Override
            public void call(Subscriber<? super MangasPage> subscriber) {
                try {
                    Request req = latestUpdatesRequest(page);
                    Response res = getClient().newCall(req).execute();
                    MangasPage mangasPage = latestUpdatesParse(res);
                    subscriber.onNext(mangasPage);
                    subscriber.onCompleted();
                } catch (Throwable t) {
                    subscriber.onError(t);
                }
            }
        });
    }

    @Override
    public Observable<SManga> fetchMangaDetails(final SManga manga) {
        return Observable.create(new Observable.OnSubscribe<SManga>() {
            @Override
            public void call(Subscriber<? super SManga> subscriber) {
                try {
                    Request req = mangaDetailsRequest(manga);
                    Response res = getClient().newCall(req).execute();
                    SManga details = mangaDetailsParse(res);
                    subscriber.onNext(details);
                    subscriber.onCompleted();
                } catch (Throwable t) {
                    subscriber.onError(t);
                }
            }
        });
    }

    @Override
    public Observable<List<SChapter>> fetchChapterList(final SManga manga) {
        return Observable.create(new Observable.OnSubscribe<List<SChapter>>() {
            @Override
            public void call(Subscriber<? super List<SChapter>> subscriber) {
                try {
                    Request req = chapterListRequest(manga);
                    Response res = getClient().newCall(req).execute();
                    List<SChapter> chapters = chapterListParse(res);
                    subscriber.onNext(chapters);
                    subscriber.onCompleted();
                } catch (Throwable t) {
                    subscriber.onError(t);
                }
            }
        });
    }

    @Override
    public Observable<List<Page>> fetchPageList(final SChapter chapter) {
        return Observable.create(new Observable.OnSubscribe<List<Page>>() {
            @Override
            public void call(Subscriber<? super List<Page>> subscriber) {
                try {
                    Request req = pageListRequest(chapter);
                    Response res = getClient().newCall(req).execute();
                    List<Page> pages = pageListParse(res);
                    subscriber.onNext(pages);
                    subscriber.onCompleted();
                } catch (Throwable t) {
                    subscriber.onError(t);
                }
            }
        });
    }
}
