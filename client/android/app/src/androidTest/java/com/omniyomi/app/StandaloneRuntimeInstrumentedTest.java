package com.omniyomi.app;

import static org.junit.Assert.*;

import android.content.Context;

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
