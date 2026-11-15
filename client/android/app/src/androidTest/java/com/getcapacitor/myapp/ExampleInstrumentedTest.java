package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.pm.PackageManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void applicationUsesOmniYomiPackage() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.omniyomi.app", appContext.getPackageName());
        assertNotNull(appContext.getApplicationInfo());
    }

    @Test
    public void internetPermissionIsDeclared() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        int permission = appContext.checkCallingOrSelfPermission(android.Manifest.permission.INTERNET);
        assertEquals(PackageManager.PERMISSION_GRANTED, permission);
    }
}