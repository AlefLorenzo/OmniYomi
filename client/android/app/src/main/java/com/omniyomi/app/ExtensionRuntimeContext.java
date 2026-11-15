package com.omniyomi.app;

import android.content.Context;

public final class ExtensionRuntimeContext {
    private static volatile Context context;
    private ExtensionRuntimeContext() {}

    public static void initialize(Context value) {
        if (value != null) context = value.getApplicationContext();
    }

    public static Context getContext() {
        Context value = context;
        if (value == null) throw new IllegalStateException("OmniYomi extension runtime is not initialized.");
        return value;
    }
}
