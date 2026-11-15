package eu.kanade.tachiyomi.source.online;

import eu.kanade.tachiyomi.network.NetworkHelper;
import eu.kanade.tachiyomi.source.CatalogueSource;
import eu.kanade.tachiyomi.source.model.FilterList;
import eu.kanade.tachiyomi.source.model.MangasPage;
import eu.kanade.tachiyomi.source.model.Page;
import eu.kanade.tachiyomi.source.model.SChapter;
import eu.kanade.tachiyomi.source.model.SManga;
import java.net.URI;
import java.security.MessageDigest;
import java.util.List;
import kotlin.coroutines.Continuation;
import okhttp3.Headers;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import rx.Observable;
import rx.Subscriber;

/**
 * Host implementation of the Mihon HttpSource contract.
 * It preserves the legacy request/parse API and supplies the 1.6 suspend JVM
 * entry points through CatalogueSource/Source default methods.
 */
public abstract class HttpSource implements CatalogueSource {
    private static final NetworkHelper NETWORK = new NetworkHelper();

    public abstract String getBaseUrl();
    @Override public abstract String getName();
    @Override public abstract String getLang();
    @Override public boolean getSupportsLatest() { return false; }

    public String getHomeUrl() { return getBaseUrl(); }
    public int getVersionId() { return 1; }

    protected NetworkHelper getNetwork() { return NETWORK; }

    @Override
    public long getId() {
        return generateId(getName(), getLang(), getVersionId());
    }

    protected long generateId(String name, String lang, int versionId) {
        String safeName = name == null ? getClass().getName() : name;
        String safeLang = lang == null ? "" : lang;
        String key = (safeName.toLowerCase(java.util.Locale.ROOT) + "/" + safeLang + "/" + versionId);
        try {
            byte[] bytes = MessageDigest.getInstance("MD5").digest(key.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            long value = 0L;
            for (int i = 0; i < 8; i++) value |= ((long) bytes[i] & 0xffL) << (8 * (7 - i));
            return value & Long.MAX_VALUE;
        } catch (Exception e) {
            return key.hashCode() & 0x7fffffffL;
        }
    }

    public Headers getHeaders() { return headersBuilder().build(); }
    protected Headers.Builder headersBuilder() {
        return new Headers.Builder().add("User-Agent", getNetwork().defaultUserAgentProvider());
    }
    public OkHttpClient getClient() { return getNetwork().getClient(); }
    public FilterList getFilterList() { return new FilterList(); }

    protected Request popularMangaRequest(int page) { throw new UnsupportedOperationException("popularMangaRequest"); }
    protected MangasPage popularMangaParse(Response response) throws Exception { throw new UnsupportedOperationException("popularMangaParse"); }
    protected Request searchMangaRequest(int page, String query, FilterList filters) { throw new UnsupportedOperationException("searchMangaRequest"); }
    protected MangasPage searchMangaParse(Response response) throws Exception { throw new UnsupportedOperationException("searchMangaParse"); }
    protected Request latestUpdatesRequest(int page) { throw new UnsupportedOperationException("latestUpdatesRequest"); }
    protected MangasPage latestUpdatesParse(Response response) throws Exception { throw new UnsupportedOperationException("latestUpdatesParse"); }
    public Request mangaDetailsRequest(SManga manga) {
        return eu.kanade.tachiyomi.network.RequestsKt.GET(getBaseUrl() + manga.getUrl(), getHeaders());
    }
    protected SManga mangaDetailsParse(Response response) throws Exception { throw new UnsupportedOperationException("mangaDetailsParse"); }
    public Request chapterListRequest(SManga manga) {
        return eu.kanade.tachiyomi.network.RequestsKt.GET(getBaseUrl() + manga.getUrl(), getHeaders());
    }
    protected List<SChapter> chapterListParse(Response response) throws Exception { throw new UnsupportedOperationException("chapterListParse"); }
    public Request pageListRequest(SChapter chapter) {
        return eu.kanade.tachiyomi.network.RequestsKt.GET(getBaseUrl() + chapter.getUrl(), getHeaders());
    }
    protected List<Page> pageListParse(Response response) throws Exception { throw new UnsupportedOperationException("pageListParse"); }
    protected Request imageUrlRequest(Page page) {
        return eu.kanade.tachiyomi.network.RequestsKt.GET(page.getUrl(), getHeaders());
    }

    /** Public host bridge for the offline downloader; keeps extension overrides protected. */
    public final Request getImageUrlRequestForDownload(Page page) {
        return imageUrlRequest(page);
    }
    protected String imageUrlParse(Response response) throws Exception { throw new UnsupportedOperationException("imageUrlParse"); }
    protected Request imageRequest(Page page) {
        if (page.getImageUrl() == null) throw new IllegalStateException("Page imageUrl is null");
        return eu.kanade.tachiyomi.network.RequestsKt.GET(page.getImageUrl(), getHeaders());
    }

    @Override
    public Observable<MangasPage> fetchPopularManga(final int page) {
        return Observable.create(subscriber -> executeParse(popularMangaRequest(page), subscriber, this::popularMangaParse));
    }

    @Override
    public Observable<MangasPage> fetchSearchManga(final int page, final String query, final FilterList filters) {
        return Observable.create(subscriber -> executeParse(searchMangaRequest(page, query, filters), subscriber, this::searchMangaParse));
    }

    @Override
    public Observable<MangasPage> fetchLatestUpdates(final int page) {
        return Observable.create(subscriber -> executeParse(latestUpdatesRequest(page), subscriber, this::latestUpdatesParse));
    }

    @Override
    public Observable<SManga> fetchMangaDetails(final SManga manga) {
        return Observable.create(subscriber -> executeParse(mangaDetailsRequest(manga), subscriber, response -> {
            SManga details = mangaDetailsParse(response);
            if (details != null) details.setInitialized(true);
            return details;
        }));
    }

    @Override
    public Observable<List<SChapter>> fetchChapterList(final SManga manga) {
        return Observable.create(subscriber -> executeParse(chapterListRequest(manga), subscriber, this::chapterListParse));
    }

    @Override
    public Observable<List<Page>> fetchPageList(final SChapter chapter) {
        return Observable.create(subscriber -> executeParse(pageListRequest(chapter), subscriber, this::pageListParse));
    }

    public Observable<String> fetchImageUrl(final Page page) {
        return Observable.create(subscriber -> executeParse(imageUrlRequest(page), subscriber, this::imageUrlParse));
    }

    /** Kotlin suspend fun getImageUrl(page): String */
    public Object getImageUrl(Page page, Continuation<? super String> continuation) {
        return fetchImageUrl(page).toBlocking().first();
    }

    /** Kotlin suspend fun getImage(page, existingSize): Response */
    public Object getImage(Page page, long existingSize, Continuation<? super Response> continuation) throws Exception {
        return eu.kanade.tachiyomi.network.OkHttpExtensionsKt.newCachelessCallWithProgress(
            getClient(), imageRequest(page), page, existingSize
        ).execute();
    }

    /** Kotlin default-argument bridge for getImage(page, existingSize = 0L). */
    public static Object getImage$default(
        HttpSource receiver,
        Page page,
        long existingSize,
        Continuation<? super Response> continuation,
        int mask,
        Object marker
    ) throws Exception {
        if ((mask & 2) != 0) existingSize = 0L;
        return receiver.getImage(page, existingSize, continuation);
    }

    public String getMangaUrl(SManga manga) {
        return mangaDetailsRequest(manga).url().toString();
    }

    public String getChapterUrl(SChapter chapter) {
        return pageListRequest(chapter).url().toString();
    }

    public void setUrlWithoutDomain(SManga manga, String url) {
        manga.setUrl(urlWithoutDomain(url));
    }

    public void setUrlWithoutDomain(SChapter chapter, String url) {
        chapter.setUrl(urlWithoutDomain(url));
    }

    protected String urlWithoutDomain(String original) {
        try {
            URI uri = new URI(original.replace(" ", "%20"));
            String path = uri.getRawPath() == null ? "" : uri.getRawPath();
            if (uri.getRawQuery() != null) path += "?" + uri.getRawQuery();
            if (uri.getRawFragment() != null) path += "#" + uri.getRawFragment();
            return path;
        } catch (Exception e) {
            return original;
        }
    }

    public void prepareNewChapter(SChapter chapter, SManga manga) { }

    private interface ResponseParser<T> { T parse(Response response) throws Exception; }

    private <T> void executeParse(Request request, Subscriber<? super T> subscriber, ResponseParser<T> parser) {
        if (subscriber.isUnsubscribed()) return;
        try (Response response = getClient().newCall(request).execute()) {
            if (!response.isSuccessful()) throw new eu.kanade.tachiyomi.network.HttpException(response.code());
            T result = parser.parse(response);
            if (!subscriber.isUnsubscribed()) {
                subscriber.onNext(result);
                subscriber.onCompleted();
            }
        } catch (Throwable error) {
            if (!subscriber.isUnsubscribed()) subscriber.onError(error);
        }
    }

    @Override
    public String toString() {
        return getName() + " (" + getLang().toUpperCase(java.util.Locale.ROOT) + ")";
    }
}
