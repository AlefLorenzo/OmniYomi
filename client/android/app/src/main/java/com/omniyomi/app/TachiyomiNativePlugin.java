package com.omniyomi.app;

import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import eu.kanade.tachiyomi.source.Source;
import eu.kanade.tachiyomi.source.model.*;

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

        executor.execute(() -> {
            try {
                MangasPage res = manager.getPopularManga(sourceId, page);
                JSArray mangas = new JSArray();
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
                JSObject ret = new JSObject();
                ret.put("manga", mangas);
                ret.put("hasNextPage", res.getHasNextPage());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getPopularManga na fonte " + sourceId, e);
                call.reject("Erro ao buscar populares da extensão: " + e.getMessage());
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

        executor.execute(() -> {
            try {
                MangasPage res = manager.getLatestManga(sourceId, page);
                JSArray mangas = new JSArray();
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
                JSObject ret = new JSObject();
                ret.put("manga", mangas);
                ret.put("hasNextPage", res.getHasNextPage());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getLatestManga na fonte " + sourceId, e);
                call.reject("Erro ao buscar lançamentos da extensão: " + e.getMessage());
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

        executor.execute(() -> {
            try {
                MangasPage res = manager.searchManga(sourceId, query, page);
                JSArray mangas = new JSArray();
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
                JSObject ret = new JSObject();
                ret.put("manga", mangas);
                ret.put("hasNextPage", res.getHasNextPage());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro searchManga na fonte " + sourceId, e);
                call.reject("Erro na busca da extensão: " + e.getMessage());
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
                call.reject("Erro ao carregar detalhes da obra: " + e.getMessage());
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

        executor.execute(() -> {
            try {
                List<SChapter> chapters = manager.getChapterList(sourceId, mangaUrl);
                JSArray arr = new JSArray();
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
                JSObject ret = new JSObject();
                ret.put("chapters", arr);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getChapterList", e);
                call.reject("Erro ao carregar capítulos da extensão: " + e.getMessage());
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

        executor.execute(() -> {
            try {
                List<Page> pages = manager.getPageList(sourceId, chapterUrl);
                JSArray arr = new JSArray();
                for (Page p : pages) {
                    JSObject po = new JSObject();
                    po.put("index", p.getIndex() + 1);
                    po.put("url", p.getImageUrl() != null && !p.getImageUrl().isEmpty() ? p.getImageUrl() : p.getUrl());
                    arr.put(po);
                }
                JSObject ret = new JSObject();
                ret.put("pages", arr);
                ret.put("totalPages", pages.size());
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Erro getPageList", e);
                call.reject("Erro ao carregar páginas da extensão: " + e.getMessage());
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
}
