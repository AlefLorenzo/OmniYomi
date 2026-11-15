package eu.kanade.tachiyomi.source.model;

import java.util.List;

public abstract class Filter<T> {
    private final String name;
    public T state;

    public Filter(String name, T state) {
        this.name = name;
        this.state = state;
    }

    public String getName() { return name; }
    public T getState() { return state; }
    public void setState(T state) { this.state = state; }

    public static class Header extends Filter<Void> {
        public Header(String name) { super(name, null); }
    }

    public static class Separator extends Filter<Void> {
        public Separator(String name) { super(name, null); }
        public Separator() { super("", null); }
    }

    public static class Text extends Filter<String> {
        public Text(String name, String state) { super(name, state); }
        public Text(String name) { super(name, ""); }
    }

    public static class CheckBox extends Filter<Boolean> {
        public CheckBox(String name, boolean state) { super(name, state); }
        public CheckBox(String name) { super(name, false); }
    }

    public static class TriState extends Filter<Integer> {
        public static final int STATE_IGNORE = 0;
        public static final int STATE_INCLUDE = 1;
        public static final int STATE_EXCLUDE = 2;

        public TriState(String name, int state) { super(name, state); }
        public TriState(String name) { super(name, STATE_IGNORE); }
        public boolean isIgnored() { return state == STATE_IGNORE; }
        public boolean isIncluded() { return state == STATE_INCLUDE; }
        public boolean isExcluded() { return state == STATE_EXCLUDE; }
    }

    public static class Select<V> extends Filter<Integer> {
        public final V[] values;
        public Select(String name, V[] values, int state) {
            super(name, state);
            this.values = values;
        }
        public Select(String name, V[] values) { this(name, values, 0); }
    }

    public static class Sort extends Filter<Sort.Selection> {
        public static class Selection {
            public final int index;
            public final boolean ascending;
            public Selection(int index, boolean ascending) {
                this.index = index;
                this.ascending = ascending;
            }
        }
        public final String[] values;
        public Sort(String name, String[] values, Selection state) {
            super(name, state);
            this.values = values;
        }
    }

    public static class Group<V> extends Filter<List<V>> {
        public Group(String name, List<V> state) { super(name, state); }
    }
}
