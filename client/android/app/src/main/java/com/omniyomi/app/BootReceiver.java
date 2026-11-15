package com.omniyomi.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "OmniYomiBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.i(TAG, "Recebido broadcast: " + action);

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            // Reinicializar o ExtensionManager para recarregar extensões instaladas
            try {
                ExtensionManager.getInstance(context.getApplicationContext());
                Log.i(TAG, "ExtensionManager reinicializado após boot/update");
            } catch (Exception e) {
                Log.e(TAG, "Erro ao reinicializar ExtensionManager", e);
            }
        }
    }
}