package eu.kanade.tachiyomi.source.online;

import eu.kanade.tachiyomi.source.model.MangasPage;
import eu.kanade.tachiyomi.source.model.Page;
import eu.kanade.tachiyomi.source.model.SChapter;
import eu.kanade.tachiyomi.source.model.SManga;
import java.util.ArrayList;
import java.util.List;
import okhttp3.Response;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

/**
 * Compatibility implementation of Mihon's ParsedHttpSource selectors.
 * Selector hooks are protected to match the Kotlin source API binary contract.
 */
public abstract class ParsedHttpSource extends HttpSource {
    protected abstract String popularMangaSelector();
    protected abstract SManga popularMangaFromElement(Element element);
    protected abstract String popularMangaNextPageSelector();

    protected abstract String searchMangaSelector();
    protected abstract SManga searchMangaFromElement(Element element);
    protected abstract String searchMangaNextPageSelector();

    protected String latestUpdatesSelector() { return popularMangaSelector(); }
    protected SManga latestUpdatesFromElement(Element element) { return popularMangaFromElement(element); }
    protected String latestUpdatesNextPageSelector() { return popularMangaNextPageSelector(); }

    protected abstract String chapterListSelector();
    protected abstract SChapter chapterFromElement(Element element);
    protected abstract SManga mangaDetailsParse(Document document);
    protected abstract List<Page> pageListParse(Document document);
    protected String imageUrlParse(Document document) { throw new UnsupportedOperationException("imageUrlParse(Document)"); }

    @Override
    protected MangasPage popularMangaParse(Response response) throws Exception {
        Document document = Jsoup.parse(response.body().string(), response.request().url().toString());
        List<SManga> mangas = new ArrayList<>();
        for (Element element : document.select(popularMangaSelector())) mangas.add(popularMangaFromElement(element));
        String next = popularMangaNextPageSelector();
        return new MangasPage(mangas, next != null && !document.select(next).isEmpty());
    }

    @Override
    protected MangasPage searchMangaParse(Response response) throws Exception {
        Document document = Jsoup.parse(response.body().string(), response.request().url().toString());
        List<SManga> mangas = new ArrayList<>();
        for (Element element : document.select(searchMangaSelector())) mangas.add(searchMangaFromElement(element));
        String next = searchMangaNextPageSelector();
        return new MangasPage(mangas, next != null && !document.select(next).isEmpty());
    }

    @Override
    protected MangasPage latestUpdatesParse(Response response) throws Exception {
        Document document = Jsoup.parse(response.body().string(), response.request().url().toString());
        List<SManga> mangas = new ArrayList<>();
        String selector = latestUpdatesSelector();
        if (selector != null) {
            for (Element element : document.select(selector)) mangas.add(latestUpdatesFromElement(element));
        }
        String next = latestUpdatesNextPageSelector();
        return new MangasPage(mangas, next != null && !document.select(next).isEmpty());
    }

    @Override
    protected List<SChapter> chapterListParse(Response response) throws Exception {
        Document document = Jsoup.parse(response.body().string(), response.request().url().toString());
        List<SChapter> chapters = new ArrayList<>();
        for (Element element : document.select(chapterListSelector())) chapters.add(chapterFromElement(element));
        return chapters;
    }

    @Override
    protected SManga mangaDetailsParse(Response response) throws Exception {
        return mangaDetailsParse(Jsoup.parse(response.body().string(), response.request().url().toString()));
    }

    @Override
    protected List<Page> pageListParse(Response response) throws Exception {
        return pageListParse(Jsoup.parse(response.body().string(), response.request().url().toString()));
    }

    @Override
    protected String imageUrlParse(Response response) throws Exception {
        return imageUrlParse(Jsoup.parse(response.body().string(), response.request().url().toString()));
    }
}
