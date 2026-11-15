package eu.kanade.tachiyomi.source.model;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Collection wrapper matching the List-backed FilterList data class used by
 * current Mihon extensions while preserving the old Java constructors.
 */
public class FilterList extends ArrayList<Filter<?>> {
    private final List<Filter<?>> list;

    public FilterList() {
        super();
        this.list = this;
    }

    public FilterList(List<Filter<?>> filters) {
        super(filters == null ? Collections.emptyList() : filters);
        this.list = this;
    }

    public FilterList(Filter<?>... filters) {
        super(filters == null ? Collections.emptyList() : Arrays.asList(filters));
        this.list = this;
    }

    public List<Filter<?>> getList() { return this; }

    public FilterList copy(List<Filter<?>> filters) { return new FilterList(filters); }
    public List<Filter<?>> component1() { return this; }

    // Mihon's FilterList intentionally does not implement structural equality.
    @Override public boolean equals(Object other) { return false; }
    @Override public int hashCode() { return super.hashCode(); }
}
