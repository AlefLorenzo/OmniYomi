package eu.kanade.tachiyomi.source.online;

import eu.kanade.tachiyomi.source.Source;
import eu.kanade.tachiyomi.source.model.SChapter;
import eu.kanade.tachiyomi.source.model.SManga;
import kotlin.coroutines.Continuation;

/** 1.5/1.6 URI resolving capability. */
public interface ResolvableSource extends Source {
    UriType getUriType(String uri);
    Object getManga(String uri, Continuation<? super SManga> continuation);
    Object getChapter(String uri, Continuation<? super SChapter> continuation);
}
