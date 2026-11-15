package eu.kanade.tachiyomi.source.model;

import java.util.List;

/** Value model matching the JVM surface of Mihon's MangasPage. */
public class MangasPage {
    private final List<SManga> mangas;
    private final boolean hasNextPage;

    public MangasPage(List<SManga> mangas, boolean hasNextPage) {
        this.mangas = mangas;
        this.hasNextPage = hasNextPage;
    }

    public List<SManga> getMangas() { return mangas; }
    public boolean getHasNextPage() { return hasNextPage; }
    public boolean hasNextPage() { return hasNextPage; }

    public List<SManga> component1() { return mangas; }
    public boolean component2() { return hasNextPage; }

    public MangasPage copy(List<SManga> mangas, boolean hasNextPage) {
        return new MangasPage(mangas, hasNextPage);
    }
}
