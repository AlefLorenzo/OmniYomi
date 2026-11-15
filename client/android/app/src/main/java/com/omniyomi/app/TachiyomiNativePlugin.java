package com.omniyomi.app;

import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import eu.kanade.tachiyomi.source.Source;
import eu.kanade.tachiyomi.source.ConfigurableSource;
import eu.kanade.tachiyomi.source.model.*;

import java.util.Iterator;
import java.util.Map;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "TachiyomiNative")
public class TachiyomiNativePlugin extends Plugin {
    private static final String TAG = "TachiyomiNativePlugin";
    private ExtensionManager manager;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @Override
    public void load() {
        super.load();
        manager = ExtensionManager.getInstance(getContext());
        Log.i(TAG, "TachiyomiNativePlugin inicializado com sucesso!");
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    @PluginMethod
    public void installExtension(PluginCall call) {
        String apkUrl = call.getString("apkUrl");
        String pkg = call.getString("pkg");
        if (apkUrl == null || pkg == null) {
            call.reject("apkUrl e pkg são obrigatórios");
            return;
        }

        executor.execute(() -> {
            try {
                File apkFile = manager.downloadExtension(apkUrl, pkg);
                List<Source> sources = manager.loadExtensionApk(apkFile, pkg);

                JSArray arr = new JSArray();
                for (Source s : sources) {
                    JSObject so = new JSObject();
                    so.put("id", String.valueOf(s.getId()));
                    so.put("name", s.getName());
                    so.put("lang", s.getLang());
                    arr.put(so);
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("pkg", pkg);
                ret.put("sources", arr);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro ao instalar extensão nativa " + pkg, e);
                call.reject("Falha ao instalar extensão nativa: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void uninstallExtension(PluginCall call) {
        String pkg = call.getString("pkg");
        if (pkg == null) {
            call.reject("pkg é obrigatório");
            return;
        }
        boolean ok = manager.uninstallExtension(pkg);
        JSObject ret = new JSObject();
        ret.put("success", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void getInstalledSources(PluginCall call) {
        JSArray arr = new JSArray();
        for (Source s : manager.getAllSources()) {
            JSObject so = new JSObject();
            so.put("id", String.valueOf(s.getId()));
            so.put("name", s.getName());
            so.put("lang", s.getLang());
            so.put("supportsLatest", s instanceof eu.kanade.tachiyomi.source.CatalogueSource
                && ((eu.kanade.tachiyomi.source.CatalogueSource) s).getSupportsLatest());
            so.put("isNative", true);
            arr.put(so);
        }
        JSObject ret = new JSObject();
        ret.put("sources", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPopularManga(PluginCall call) {
        String sourceId = call.getString("sourceId");
        int page = call.getInt("page", 1);
        if (sourceId == null) {
            call.reject("sourceId é obrigatório");
            return;
        }

        // Validação prévia: verificar se a fonte existe e está carregada
        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId + ". Instale a extensão primeiro.");
            return;
        }

        executor.execute(() -> {
            try {
                MangasPage res = manager.getPopularManga(sourceId, page);
                JSArray mangas = new JSArray();
                if (res != null && res.getMangas() != null) {
                    for (SManga m : res.getMangas()) {
                        JSObject mo = new JSObject();
                        mo.put("id", m.getUrl());
                        mo.put("sourceId", sourceId);
                        mo.put("title", m.getTitle());
                        mo.put("url", m.getUrl());
                        mo.put("coverUrl", m.getThumbnail_url());
                        mo.put("author", m.getAuthor());
                        mo.put("artist", m.getArtist());
                        mo.put("description", m.getDescription());
                        mo.put("status", m.getStatus() == SManga.COMPLETED ? "completed" : "ongoing");
                        mangas.put(mo);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("manga", mangas);
                ret.put("hasNextPage", res != null ? res.getHasNextPage() : false);
                call.resolve(ret);
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Fonte inválida: " + sourceId + " - " + e.getMessage());
                call.reject("Fonte não disponível: " + e.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "Erro getPopularManga na fonte " + sourceId, e);
                // Retornar resposta de erro estruturada em vez de rejeitar
                JSObject ret = new JSObject();
                ret.put("error", true);
                ret.put("message", "Falha ao buscar populares: " + e.getMessage());
                ret.put("manga", new JSArray());
                ret.put("hasNextPage", false);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void getLatestManga(PluginCall call) {
        String sourceId = call.getString("sourceId");
        int page = call.getInt("page", 1);
        if (sourceId == null) {
            call.reject("sourceId é obrigatório");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId + ". Instale a extensão primeiro.");
            return;
        }

        executor.execute(() -> {
            try {
                MangasPage res = manager.getLatestManga(sourceId, page);
                JSArray mangas = new JSArray();
                if (res != null && res.getMangas() != null) {
                    for (SManga m : res.getMangas()) {
                        JSObject mo = new JSObject();
                        mo.put("id", m.getUrl());
                        mo.put("sourceId", sourceId);
                        mo.put("title", m.getTitle());
                        mo.put("url", m.getUrl());
                        mo.put("coverUrl", m.getThumbnail_url());
                        mo.put("author", m.getAuthor());
                        mo.put("artist", m.getArtist());
                        mo.put("description", m.getDescription());
                        mo.put("status", m.getStatus() == SManga.COMPLETED ? "completed" : "ongoing");
                        mangas.put(mo);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("manga", mangas);
                ret.put("hasNextPage", res != null ? res.getHasNextPage() : false);
                call.resolve(ret);
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Fonte não suporta recentes: " + sourceId + " - " + e.getMessage());
                JSObject ret = new JSObject();
                ret.put("error", true);
                ret.put("message", e.getMessage());
                ret.put("manga", new JSArray());
                ret.put("hasNextPage", false);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getLatestManga na fonte " + sourceId, e);
                JSObject ret = new JSObject();
                ret.put("error", true);
                ret.put("message", "Falha ao buscar recentes: " + e.getMessage());
                ret.put("manga", new JSArray());
                ret.put("hasNextPage", false);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void searchManga(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String query = call.getString("query", "");
        int page = call.getInt("page", 1);
        if (sourceId == null) {
            call.reject("sourceId é obrigatório");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId + ". Instale a extensão primeiro.");
            return;
        }

        executor.execute(() -> {
            try {
                MangasPage res = manager.searchManga(sourceId, query, page);
                JSArray mangas = new JSArray();
                if (res != null && res.getMangas() != null) {
                    for (SManga m : res.getMangas()) {
                        JSObject mo = new JSObject();
                        mo.put("id", m.getUrl());
                        mo.put("sourceId", sourceId);
                        mo.put("title", m.getTitle());
                        mo.put("url", m.getUrl());
                        mo.put("coverUrl", m.getThumbnail_url());
                        mo.put("author", m.getAuthor());
                        mo.put("artist", m.getArtist());
                        mo.put("description", m.getDescription());
                        mo.put("status", m.getStatus() == SManga.COMPLETED ? "completed" : "ongoing");
                        mangas.put(mo);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("manga", mangas);
                ret.put("hasNextPage", res != null ? res.getHasNextPage() : false);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro searchManga na fonte " + sourceId, e);
                JSObject ret = new JSObject();
                ret.put("error", true);
                ret.put("message", "Falha na busca: " + e.getMessage());
                ret.put("manga", new JSArray());
                ret.put("hasNextPage", false);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void getMangaDetails(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String mangaUrl = call.getString("mangaUrl");
        if (sourceId == null || mangaUrl == null) {
            call.reject("sourceId e mangaUrl são obrigatórios");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId + ". Instale a extensão primeiro.");
            return;
        }

        executor.execute(() -> {
            try {
                SManga m = manager.getMangaDetails(sourceId, mangaUrl);
                JSObject ret = new JSObject();
                ret.put("id", m.getUrl() != null ? m.getUrl() : mangaUrl);
                ret.put("sourceId", sourceId);
                ret.put("title", m.getTitle());
                ret.put("coverUrl", m.getThumbnail_url());
                ret.put("author", m.getAuthor());
                ret.put("artist", m.getArtist());
                ret.put("description", m.getDescription());
                ret.put("status", m.getStatus() == SManga.COMPLETED ? "completed" : "ongoing");
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getMangaDetails", e);
                JSObject ret = new JSObject();
                ret.put("error", true);
                ret.put("message", "Falha ao carregar detalhes: " + e.getMessage());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void getChapterList(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String mangaUrl = call.getString("mangaUrl");
        if (sourceId == null || mangaUrl == null) {
            call.reject("sourceId e mangaUrl são obrigatórios");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId + ". Instale a extensão primeiro.");
            return;
        }

        executor.execute(() -> {
            try {
                List<SChapter> chapters = manager.getChapterList(sourceId, mangaUrl);
                JSArray arr = new JSArray();
                if (chapters != null) {
                    for (int i = 0; i < chapters.size(); i++) {
                        SChapter c = chapters.get(i);
                        JSObject co = new JSObject();
                        co.put("id", c.getUrl());
                        co.put("mangaId", mangaUrl);
                        co.put("name", c.getName());
                        co.put("url", c.getUrl());
                        co.put("chapterNumber", c.getChapter_number() >= 0 ? c.getChapter_number() : (i + 1));
                        co.put("scanlator", c.getScanlator());
                        co.put("releasedAt", c.getDate_upload() > 0 ? String.valueOf(c.getDate_upload()) : new java.util.Date().toString());
                        arr.put(co);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("chapters", arr);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getChapterList", e);
                JSObject ret = new JSObject();
                ret.put("error", true);
                ret.put("message", "Falha ao carregar capítulos: " + e.getMessage());
                ret.put("chapters", new JSArray());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void getPageList(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String chapterUrl = call.getString("chapterUrl");
        if (sourceId == null || chapterUrl == null) {
            call.reject("sourceId e chapterUrl são obrigatórios");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId + ". Instale a extensão primeiro.");
            return;
        }

        executor.execute(() -> {
            try {
                List<Page> pages = manager.getPageList(sourceId, chapterUrl);
                JSArray arr = new JSArray();
                if (pages != null) {
                    for (Page p : pages) {
                        JSObject po = new JSObject();
                        po.put("index", p.getIndex() + 1);
                        po.put("url", p.getImageUrl() != null && !p.getImageUrl().isEmpty() ? p.getImageUrl() : p.getUrl());
                        arr.put(po);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("pages", arr);
                ret.put("totalPages", pages != null ? pages.size() : 0);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getPageList", e);
                JSObject ret = new JSObject();
                ret.put("error", true);
                ret.put("message", "Falha ao carregar páginas: " + e.getMessage());
                ret.put("pages", new JSArray());
                ret.put("totalPages", 0);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void downloadChapter(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String mangaId = call.getString("mangaId");
        String chapterId = call.getString("chapterId");
        JSArray urlsArr = call.getArray("imageUrls");
        if (sourceId == null || mangaId == null || chapterId == null || urlsArr == null) {
            call.reject("Parâmetros de download inválidos");
            return;
        }

        executor.execute(() -> {
            try {
                List<String> list = new ArrayList<>();
                for (int i = 0; i < urlsArr.length(); i++) {
                    list.add(urlsArr.getString(i));
                }
                boolean ok = manager.downloadChapter(sourceId, mangaId, chapterId, list);
                JSObject ret = new JSObject();
                ret.put("success", ok);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro downloadChapter", e);
                call.reject("Erro ao baixar capítulo: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void downloadChapterFromSource(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String mangaId = call.getString("mangaId");
        String chapterId = call.getString("chapterId");
        if (sourceId == null || mangaId == null || chapterId == null) {
            call.reject("sourceId, mangaId e chapterId são obrigatórios");
            return;
        }

        executor.execute(() -> {
            try {
                boolean success = manager.downloadChapterFromSource(sourceId, mangaId, chapterId);
                JSObject ret = new JSObject();
                ret.put("success", success);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Falha ao baixar capítulo usando a própria extensão", e);
                call.reject("Falha no download local: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getDownloadedChapters(PluginCall call) {
        JSArray arr = new JSArray();
        for (java.util.Map<String, Object> item : manager.getDownloadedChapters()) {
            JSObject entry = new JSObject();
            for (java.util.Map.Entry<String, Object> field : item.entrySet()) {
                entry.put(field.getKey(), field.getValue());
            }
            arr.put(entry);
        }
        JSObject ret = new JSObject();
        ret.put("downloads", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void getStorageUsage(PluginCall call) {
        JSObject ret = new JSObject();
        long bytes = manager.getDownloadsStorageBytes();
        ret.put("totalBytes", bytes);
        ret.put("formatted", String.format(java.util.Locale.US, "%.1f MB", bytes / 1048576.0));
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteOfflineChapter(PluginCall call) {
        String chapterId = call.getString("chapterId");
        if (chapterId == null) {
            call.reject("chapterId é obrigatório");
            return;
        }
        boolean deleted = manager.deleteOfflineChapterById(chapterId);
        JSObject ret = new JSObject();
        ret.put("success", deleted);
        call.resolve(ret);
    }

    @PluginMethod
    public void deleteAllOfflineDownloads(PluginCall call) {
        int deleted = manager.deleteAllOfflineDownloads();
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("deletedFolders", deleted);
        call.resolve(ret);
    }

    @PluginMethod
    public void getOfflinePages(PluginCall call) {
        String sourceId = call.getString("sourceId");
        String mangaId = call.getString("mangaId");
        String chapterId = call.getString("chapterId");
        if (sourceId == null || mangaId == null || chapterId == null) {
            call.reject("sourceId, mangaId e chapterId são obrigatórios");
            return;
        }

        List<String> files = manager.getOfflinePages(sourceId, mangaId, chapterId);
        JSArray arr = new JSArray();
        for (int i = 0; i < files.size(); i++) {
            JSObject po = new JSObject();
            po.put("index", i + 1);
            po.put("url", files.get(i));
            arr.put(po);
        }
        JSObject ret = new JSObject();
        ret.put("isOffline", true);
        ret.put("pages", arr);
        ret.put("totalPages", files.size());
        call.resolve(ret);
    }

    // ─── Configuração de fontes configuráveis (ConfigurableSource) ──────────────

    @PluginMethod
    public void getConfigurableSourceInfo(PluginCall call) {
        String sourceId = call.getString("sourceId");
        if (sourceId == null) {
            call.reject("sourceId é obrigatório");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId);
            return;
        }

        boolean isConfigurable = source instanceof ConfigurableSource;
        JSObject ret = new JSObject();
        ret.put("sourceId", sourceId);
        ret.put("name", source.getName());
        ret.put("isConfigurable", isConfigurable);

        if (isConfigurable) {
            ConfigurableSource configSource = (ConfigurableSource) source;
            android.content.SharedPreferences prefs = configSource.getSourcePreferences();
            JSObject config = new JSObject();
            // Carregar configurações existentes
            Map<String, ?> allPrefs = prefs.getAll();
            for (Map.Entry<String, ?> entry : allPrefs.entrySet()) {
                config.put(entry.getKey(), String.valueOf(entry.getValue()));
            }
            ret.put("configuration", config);
            ret.put("needsConfiguration", !prefs.contains("serverUrl") || prefs.getString("serverUrl", "").isEmpty());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void saveSourceConfiguration(PluginCall call) {
        String sourceId = call.getString("sourceId");
        JSObject config = call.getObject("configuration");
        if (sourceId == null || config == null) {
            call.reject("sourceId e configuration são obrigatórios");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId);
            return;
        }

        if (!(source instanceof ConfigurableSource)) {
            call.reject("Esta fonte não suporta configuração");
            return;
        }

        ConfigurableSource configSource = (ConfigurableSource) source;
        android.content.SharedPreferences prefs = configSource.getSourcePreferences();
        android.content.SharedPreferences.Editor editor = prefs.edit();

        // Salvar todas as chaves do objeto de configuração
        Iterator<String> keys = config.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = config.getString(key);
            if (value != null) {
                editor.putString(key, value);
            }
        }
        editor.apply();

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("message", "Configuração salva com sucesso");
        call.resolve(ret);
    }

    @PluginMethod
    public void testSourceConnection(PluginCall call) {
        String sourceId = call.getString("sourceId");
        if (sourceId == null) {
            call.reject("sourceId é obrigatório");
            return;
        }

        Source source = manager.getSource(sourceId);
        if (source == null) {
            call.reject("Fonte não encontrada: " + sourceId);
            return;
        }

        executor.execute(() -> {
            try {
                if (source instanceof eu.kanade.tachiyomi.source.CatalogueSource) {
                    eu.kanade.tachiyomi.source.CatalogueSource catSource = (eu.kanade.tachiyomi.source.CatalogueSource) source;
                    // Tentar buscar a primeira página do catálogo
                    MangasPage res = ExtensionSuspendBridge.popular(catSource, 1);
                    int count = res.getMangas() != null ? res.getMangas().size() : 0;
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("message", "Conexão bem-sucedida: " + count + " obra(s) encontrada(s)");
                    ret.put("count", count);
                    call.resolve(ret);
                } else {
                    call.reject("Esta fonte não suporta catálogo");
                }
            } catch (Exception e) {
                Log.e(TAG, "Erro ao testar conexão da fonte " + sourceId, e);
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("message", "Falha na conexão: " + e.getMessage());
                call.resolve(ret);
            }
        });
    }
}
