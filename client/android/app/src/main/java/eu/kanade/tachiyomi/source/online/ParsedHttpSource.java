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

public abstract class ParsedHttpSource extends HttpSource {
    public abstract String popularMangaSelector();
    public abstract SManga popularMangaFromElement(Element element);
    public abstract String popularMangaNextPageSelector();

    @Override
    public MangasPage popularMangaParse(Response response) throws Exception {
        String html = response.body().string();
        Document document = Jsoup.parse(html, getBaseUrl());
        Elements elements = document.select(popularMangaSelector());
        List<SManga> mangas = new ArrayList<>();
        for (Element el : elements) {
            mangas.add(popularMangaFromElement(el));
        }
        String nextSelector = popularMangaNextPageSelector();
        boolean hasNext = nextSelector != null && !document.select(nextSelector).isEmpty();
        return new MangasPage(mangas, hasNext);
    }

    public abstract String searchMangaSelector();
    public abstract SManga searchMangaFromElement(Element element);
    public abstract String searchMangaNextPageSelector();

    @Override
    public MangasPage searchMangaParse(Response response) throws Exception {
        String html = response.body().string();
        Document document = Jsoup.parse(html, getBaseUrl());
        Elements elements = document.select(searchMangaSelector());
        List<SManga> mangas = new ArrayList<>();
        for (Element el : elements) {
            mangas.add(searchMangaFromElement(el));
        }
        String nextSelector = searchMangaNextPageSelector();
        boolean hasNext = nextSelector != null && !document.select(nextSelector).isEmpty();
        return new MangasPage(mangas, hasNext);
    }

    public abstract String chapterListSelector();
    public abstract SChapter chapterFromElement(Element element);

    @Override
    public List<SChapter> chapterListParse(Response response) throws Exception {
        String html = response.body().string();
        Document document = Jsoup.parse(html, getBaseUrl());
        Elements elements = document.select(chapterListSelector());
        List<SChapter> chapters = new ArrayList<>();
        for (Element el : elements) {
            chapters.add(chapterFromElement(el));
        }
        return chapters;
    }

    public abstract SManga mangaDetailsParse(Document document);

    @Override
    public SManga mangaDetailsParse(Response response) throws Exception {
        String html = response.body().string();
        Document document = Jsoup.parse(html, getBaseUrl());
        return mangaDetailsParse(document);
    }

    public abstract List<Page> pageListParse(Document document);

    @Override
    public List<Page> pageListParse(Response response) throws Exception {
        String html = response.body().string();
        Document document = Jsoup.parse(html, getBaseUrl());
        return pageListParse(document);
    }
}
