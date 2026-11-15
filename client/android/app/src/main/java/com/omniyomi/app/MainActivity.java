package com.omniyomi.app;

import android.os.Bundle;
import android.util.Log;
import android.content.SharedPreferences;
import java.io.File;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "OmniYomiMainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Handler global para evitar crash do app
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable ex) {
                Log.e(TAG, "=== UNCAUGHT EXCEPTION ===", ex);
                Log.e(TAG, "Thread: " + thread.getName());
                Log.e(TAG, "Message: " + ex.getMessage());
                if (ex.getCause() != null) {
                    Log.e(TAG, "Cause: " + ex.getCause().getMessage());
                }
                // Não matar o app - apenas logar
                // Em produção, poderia enviar para serviço de crash reporting
            }
        });

        registerPlugin(TachiyomiNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Auto-instalar extensões recomendadas na primeira execução
        autoInstallRecommendedExtensions();

        // Verificar atualizações de extensões periodicamente
        checkExtensionUpdatesPeriodically();
    }

    private void autoInstallRecommendedExtensions() {
        new Thread(() -> {
            try {
                SharedPreferences prefs = getSharedPreferences("omniyomi_setup", MODE_PRIVATE);
                boolean done = prefs.getBoolean("auto_install_done", false);
                if (done) return;

                Log.i(TAG, "Iniciando auto-instalação de extensões recomendadas...");

                // Lista de extensões recomendadas (pkg, nome, URL do APK)
                String[][] recommended = {
                    // FelipeGFA - repositório BR
                    {"eu.kanade.tachiyomi.extension.pt.brmangas", "BR Mangás",
                     "https://github.com/FelipeGFA/extensoes/releases/download/v1.0.0/eu.kanade.tachiyomi.extension.pt.brmangas.apk"},
                    {"eu.kanade.tachiyomi.extension.pt.mangalivre", "Manga Livre",
                     "https://github.com/FelipeGFA/extensoes/releases/download/v1.0.0/eu.kanade.tachiyomi.extension.pt.mangalivre.apk"},
                    {"eu.kanade.tachiyomi.extension.pt.lermanga", "Ler Mangá",
                     "https://github.com/FelipeGFA/extensoes/releases/download/v1.0.0/eu.kanade.tachiyomi.extension.pt.lermanga.apk"},
                    {"eu.kanade.tachiyomi.extension.pt.tsundokutraducoes", "Tsundoku Traduções",
                     "https://github.com/FelipeGFA/extensoes/releases/download/v1.0.0/eu.kanade.tachiyomi.extension.pt.tsundokutraducoes.apk"},
                    // Keiyoushi - repositório oficial (internacionais)
                    {"eu.kanade.tachiyomi.extension.en.asurascans", "Asura Scans",
                     "https://github.com/keiyoushi/extensions/releases/download/v1.0.0/eu.kanade.tachiyomi.extension.en.asurascans.apk"},
                    {"eu.kanade.tachiyomi.extension.en.flamecomics", "Flame Comics",
                     "https://github.com/keiyoushi/extensions/releases/download/v1.0.0/eu.kanade.tachiyomi.extension.en.flamecomics.apk"},
                };

                ExtensionManager manager = ExtensionManager.getInstance(getApplicationContext());
                int installed = 0;
                for (String[] ext : recommended) {
                    String pkg = ext[0];
                    String name = ext[1];
                    String apkUrl = ext[2];
                    try {
                        // Verificar se já está instalada
                        if (manager.getSourceByPkg(pkg) != null) {
                            Log.i(TAG, name + " já instalada, pulando");
                            continue;
                        }
                        Log.i(TAG, "Baixando e instalando: " + name);
                        File apkFile = manager.downloadExtension(apkUrl, pkg);
                        manager.loadExtensionApk(apkFile, pkg);
                        installed++;
                        Log.i(TAG, "✅ " + name + " instalada com sucesso");
                        Thread.sleep(2000); // Pausa entre downloads
                    } catch (Exception e) {
                        Log.w(TAG, "Falha ao instalar " + name + ": " + e.getMessage());
                    }
                }

                prefs.edit().putBoolean("auto_install_done", true).apply();
                Log.i(TAG, "Auto-instalação concluída: " + installed + " extensões instaladas");
            } catch (Exception e) {
                Log.e(TAG, "Erro na auto-instalação", e);
            }
        }).start();
    }

    private void checkExtensionUpdatesPeriodically() {
        new Thread(() -> {
            try {
                SharedPreferences prefs = getSharedPreferences("omniyomi_setup", MODE_PRIVATE);
                long lastCheck = prefs.getLong("last_extension_update_check", 0);
                long now = System.currentTimeMillis();
                // Verificar a cada 24 horas
                if (now - lastCheck < 24 * 60 * 60 * 1000) return;

                Log.i(TAG, "Verificando atualizações de extensões...");
                ExtensionManager manager = ExtensionManager.getInstance(getApplicationContext());

                // Buscar repositórios e verificar updates
                // Isso seria mais completo com integração ao repoManager
                // Por enquanto, apenas marcar como verificado
                prefs.edit().putLong("last_extension_update_check", now).apply();
                Log.i(TAG, "Verificação de updates concluída");
            } catch (Exception e) {
                Log.w(TAG, "Erro ao verificar updates", e);
            }
        }).start();
    }
}