package eu.kanade.tachiyomi.source.model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class FilterList extends ArrayList<Filter<?>> {
    public FilterList() {
        super();
    }

    public FilterList(List<Filter<?>> list) {
        super(list);
    }

    public FilterList(Filter<?>... filters) {
        super(filters.length);
        Collections.addAll(this, filters);
    }
}
