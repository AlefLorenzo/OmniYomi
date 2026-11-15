package com.omniyomi.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;

import dalvik.system.PathClassLoader;
import eu.kanade.tachiyomi.source.CatalogueSource;
import eu.kanade.tachiyomi.source.Source;
import eu.kanade.tachiyomi.source.SourceFactory;
import eu.kanade.tachiyomi.source.model.*;
import eu.kanade.tachiyomi.network.NetworkHelper;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONArray;
import org.json.JSONObject;

public class ExtensionManager {
    private static final String TAG = "OmniExtensionManager";
    private static ExtensionManager instance;

    private final Context context;
    private final File extensionsDir;
    private final File downloadsDir;
    private final Map<String, Source> loadedSources = new ConcurrentHashMap<>();
    private final Map<String, String> sourceToPkg = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    public static synchronized ExtensionManager getInstance(Context context) {
        if (instance == null) {
            instance = new ExtensionManager(context.getApplicationContext());
        }
        return instance;
    }

    private ExtensionManager(Context context) {
        this.context = context;
        this.extensionsDir = new File(context.getFilesDir(), "extensions");
        if (!extensionsDir.exists()) extensionsDir.mkdirs();

        File extDownloads = context.getExternalFilesDir("downloads");
        this.downloadsDir = extDownloads != null ? extDownloads : new File(context.getFilesDir(), "downloads");
        if (!downloadsDir.exists()) downloadsDir.mkdirs();

        // Carrega extensões existentes já baixadas
        loadInstalledExtensions();
    }

    public synchronized void loadInstalledExtensions() {
        File[] apks = extensionsDir.listFiles((dir, name) -> name.endsWith(".apk"));
        if (apks == null) return;
        for (File apk : apks) {
            try {
                loadExtensionApk(apk);
            } catch (Exception e) {
                Log.e(TAG, "Erro ao carregar APK salvo: " + apk.getName(), e);
            }
        }
    }

    public synchronized List<Source> loadExtensionApk(File apkFile) throws Exception {
        PackageManager pm = context.getPackageManager();
        PackageInfo packageInfo = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), PackageManager.GET_META_DATA);
        if (packageInfo == null || packageInfo.applicationInfo == null) {
            throw new IllegalStateException("APK de extensão inválido ou corrompido");
        }

        ApplicationInfo appInfo = packageInfo.applicationInfo;
        appInfo.sourceDir = apkFile.getAbsolutePath();
        appInfo.publicSourceDir = apkFile.getAbsolutePath();

        PathClassLoader classLoader = new PathClassLoader(apkFile.getAbsolutePath(), context.getClassLoader());

        Bundle meta = appInfo.metaData;
        String className = meta != null ? meta.getString("tachiyomi.extension.class") : null;
        String factoryClass = meta != null ? meta.getString("tachiyomi.extension.factory") : null;

        List<Source> results = new ArrayList<>();

        if (className != null && !className.isEmpty()) {
            if (className.startsWith(".")) {
                className = packageInfo.packageName + className;
            }
            Class<?> clazz = classLoader.loadClass(className);
            Object obj = clazz.getDeclaredConstructor().newInstance();
            if (obj instanceof Source) {
                Source source = (Source) obj;
                String sid = String.valueOf(source.getId());
                loadedSources.put(sid, source);
                sourceToPkg.put(sid, packageInfo.packageName);
                results.add(source);
                Log.i(TAG, "Fonte carregada nativamente: " + source.getName() + " (ID: " + sid + ")");
            }
        } else if (factoryClass != null && !factoryClass.isEmpty()) {
            if (factoryClass.startsWith(".")) {
                factoryClass = packageInfo.packageName + factoryClass;
            }
            Class<?> clazz = classLoader.loadClass(factoryClass);
            Object obj = clazz.getDeclaredConstructor().newInstance();
            if (obj instanceof SourceFactory) {
                SourceFactory factory = (SourceFactory) obj;
                List<Source> sources = factory.createSources();
                for (Source s : sources) {
                    String sid = String.valueOf(s.getId());
                    loadedSources.put(sid, s);
                    sourceToPkg.put(sid, packageInfo.packageName);
                    results.add(s);
                    Log.i(TAG, "Fonte (Factory) carregada nativamente: " + s.getName() + " (ID: " + sid + ")");
                }
            }
        }

        return results;
    }

    public File downloadExtension(String apkUrl, String pkgName) throws IOException {
        File apkFile = new File(extensionsDir, pkgName + ".apk");
        URL url = new URL(apkUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 OmniYomi-Android");
        conn.setConnectTimeout(25000);
        conn.setReadTimeout(30000);
        conn.connect();

        if (conn.getResponseCode() >= 400) {
            throw new IOException("HTTP " + conn.getResponseCode() + " ao baixar APK da extensão: " + apkUrl);
        }

        try (InputStream in = new BufferedInputStream(conn.getInputStream());
             OutputStream out = new BufferedOutputStream(new FileOutputStream(apkFile))) {
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) != -1) {
                out.write(buf, 0, len);
            }
            out.flush();
        } finally {
            conn.disconnect();
        }
        return apkFile;
    }

    public synchronized boolean uninstallExtension(String pkgName) {
        File apkFile = new File(extensionsDir, pkgName + ".apk");
        if (apkFile.exists()) {
            apkFile.delete();
        }
        List<String> toRemove = new ArrayList<>();
        for (Map.Entry<String, String> entry : sourceToPkg.entrySet()) {
            if (entry.getValue().equals(pkgName)) {
                toRemove.add(entry.getKey());
            }
        }
        for (String id : toRemove) {
            loadedSources.remove(id);
            sourceToPkg.remove(id);
        }
        return true;
    }

    public Source getSource(String sourceId) {
        return loadedSources.get(sourceId);
    }

    public Collection<Source> getAllSources() {
        return loadedSources.values();
    }

    // Executa popular manga da extensão nativamente
    public MangasPage getPopularManga(String sourceId, int page) throws Exception {
        Source s = getSource(sourceId);
        if (!(s instanceof CatalogueSource)) {
            throw new IllegalArgumentException("Fonte não suporta catálogo: " + sourceId);
        }
        CatalogueSource cat = (CatalogueSource) s;
        return cat.fetchPopularManga(page).toBlocking().first();
    }

    // Executa busca da extensão nativamente
    public MangasPage searchManga(String sourceId, String query, int page) throws Exception {
        Source s = getSource(sourceId);
        if (!(s instanceof CatalogueSource)) {
            throw new IllegalArgumentException("Fonte não suporta busca: " + sourceId);
        }
        CatalogueSource cat = (CatalogueSource) s;
        return cat.fetchSearchManga(page, query, new FilterList()).toBlocking().first();
    }

    // Detalhes da obra nativamente
    public SManga getMangaDetails(String sourceId, String mangaUrl) throws Exception {
        Source s = getSource(sourceId);
        if (s == null) throw new IllegalArgumentException("Fonte não encontrada: " + sourceId);
        SManga manga = SManga.create();
        manga.setUrl(mangaUrl);
        return s.fetchMangaDetails(manga).toBlocking().first();
    }

    // Lista de capítulos nativamente
    public List<SChapter> getChapterList(String sourceId, String mangaUrl) throws Exception {
        Source s = getSource(sourceId);
        if (s == null) throw new IllegalArgumentException("Fonte não encontrada: " + sourceId);
        SManga manga = SManga.create();
        manga.setUrl(mangaUrl);
        return s.fetchChapterList(manga).toBlocking().first();
    }

    // Lista de páginas nativamente
    public List<Page> getPageList(String sourceId, String chapterUrl) throws Exception {
        Source s = getSource(sourceId);
        if (s == null) throw new IllegalArgumentException("Fonte não encontrada: " + sourceId);
        SChapter ch = SChapter.create();
        ch.setUrl(chapterUrl);
        return s.fetchPageList(ch).toBlocking().first();
    }

    // Download local de capítulo para leitura offline no modo avião
    public boolean downloadChapter(String sourceId, String mangaId, String chapterId, List<String> imageUrls) throws Exception {
        File chDir = new File(downloadsDir, sanitize(sourceId) + "/" + sanitize(mangaId) + "/" + sanitize(chapterId));
        if (!chDir.exists()) chDir.mkdirs();

        OkHttpClient client = NetworkHelper.getClient();

        for (int i = 0; i < imageUrls.size(); i++) {
            String imgUrl = imageUrls.get(i);
            File pageFile = new File(chDir, String.format(Locale.US, "%04d.jpg", i + 1));
            if (pageFile.exists() && pageFile.length() > 0) continue;

            Request req = new Request.Builder()
                .url(imgUrl)
                .header("User-Agent", "Mozilla/5.0 OmniYomi-Android")
                .header("Referer", imgUrl)
                .build();

            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) continue;
                try (InputStream in = res.body().byteStream();
                     OutputStream out = new FileOutputStream(pageFile)) {
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = in.read(buf)) != -1) {
                        out.write(buf, 0, len);
                    }
                }
            }
        }
        return true;
    }

    public List<String> getOfflinePages(String sourceId, String mangaId, String chapterId) {
        File chDir = new File(downloadsDir, sanitize(sourceId) + "/" + sanitize(mangaId) + "/" + sanitize(chapterId));
        if (!chDir.exists()) return Collections.emptyList();

        File[] files = chDir.listFiles((dir, name) -> name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".webp"));
        if (files == null || files.length == 0) return Collections.emptyList();

        Arrays.sort(files, Comparator.comparing(File::getName));
        List<String> list = new ArrayList<>();
        for (File f : files) {
            list.add("file://" + f.getAbsolutePath());
        }
        return list;
    }

    private String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }
}
