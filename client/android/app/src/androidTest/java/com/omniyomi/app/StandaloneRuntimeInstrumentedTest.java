package com.omniyomi.app;

import static org.junit.Assert.*;

import android.content.Context;
import java.lang.reflect.Method;
import java.util.List;
import kotlin.coroutines.Continuation;
import eu.kanade.tachiyomi.source.Source;
import eu.kanade.tachiyomi.source.CatalogueSource;
import eu.kanade.tachiyomi.source.model.SManga;
import eu.kanade.tachiyomi.source.model.SChapter;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Smoke tests for the on-device extension manager.
 *
 * These tests intentionally run with no Suwayomi/Tachidesk process. They verify
 * that local runtime initialization, local download inventory and missing-source
 * diagnostics do not require a remote server. They do not claim that arbitrary
 * third-party extension APKs are compatible.
 */
@RunWith(AndroidJUnit4.class)
public class StandaloneRuntimeInstrumentedTest {

    @Test
    public void extensionManagerStartsWithoutExternalServer() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ExtensionManager manager = ExtensionManager.getInstance(context);

        assertNotNull(manager);
        assertNotNull(manager.getAllSources());
        assertTrue(manager.getDownloadsStorageBytes() >= 0L);
        assertNotNull(manager.getDownloadedChapters());
    }

    @Test
    public void mihon16SuspendAbiIsPresent() throws Exception {
        // These exact JVM descriptors are required by ext-lib 1.6 compiled Kotlin extensions.
        CatalogueSource.class.getMethod("getPopularManga", int.class, Continuation.class);
        CatalogueSource.class.getMethod("getLatestUpdates", int.class, Continuation.class);
        CatalogueSource.class.getMethod("getSearchManga", int.class, String.class,
            eu.kanade.tachiyomi.source.model.FilterList.class, Continuation.class);
        Source.class.getMethod("getMangaUpdate", SManga.class, List.class,
            boolean.class, boolean.class, Continuation.class);
        Source.class.getMethod("getPageList", SChapter.class, Continuation.class);
        SManga.class.getMethod("getMemo");
        SChapter.class.getMethod("getMemo");
    }

    @Test
    public void unknownSourceFailsLocallyWithDiagnostic() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ExtensionManager manager = ExtensionManager.getInstance(context);

        try {
            manager.getPopularManga("omniyomi-test-source-not-installed", 1);
            fail("Expected the local manager to reject an unknown source.");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("Extensão não encontrada"));
        }
    }
}
