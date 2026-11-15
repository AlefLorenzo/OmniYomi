package com.omniyomi.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
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

public class ExtensionManager {
    private static final String TAG = "OmniExtensionManager";
    private static ExtensionManager instance;

    private final Context context;
    private final File extensionsDir;
    private final File downloadsDir;
    // loadedSources: sourceId (String numérico) → instância Source real
    private final Map<String, Source> loadedSources = new ConcurrentHashMap<>();
    // sourceToPkg: sourceId → packageName
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

        // Carrega extensões já baixadas em sessões anteriores
        loadInstalledExtensions();
    }

    public synchronized void loadInstalledExtensions() {
        File[] apks = extensionsDir.listFiles((dir, name) -> name.endsWith(".apk"));
        if (apks == null) return;
        for (File apk : apks) {
            try {
                loadExtensionApk(apk);
            } catch (Exception e) {
                Log.w(TAG, "Falha ao recarregar APK: " + apk.getName() + " — " + e.getMessage());
            }
        }
    }

    /**
     * Carrega um APK de extensão e instancia as fontes com PathClassLoader.
     * Este é o ponto central de execução nativa sem servidor.
     *
     * PROBLEMA CRÍTICO CORRIGIDO:
     * - O APK da extensão usa classes do Tachiyomi como interfaces.
     * - O PathClassLoader deve herdar do ClassLoader do OmniYomi (parent = context.getClassLoader())
     *   para que as nossas interfaces (Source, CatalogueSource, etc.) sejam resolvidas corretamente.
     * - Sem isso, o cast (Source) lança ClassCastException mesmo que o nome seja igual.
     */
    public synchronized List<Source> loadExtensionApk(File apkFile) throws Exception {
        PackageManager pm = context.getPackageManager();

        // GET_META_DATA garante que tachiyomi.extension.class seja lido do manifest
        PackageInfo packageInfo = pm.getPackageArchiveInfo(
            apkFile.getAbsolutePath(),
            PackageManager.GET_META_DATA
        );

        if (packageInfo == null || packageInfo.applicationInfo == null) {
            throw new IllegalStateException("APK inválido ou corrompido: " + apkFile.getName());
        }

        ApplicationInfo appInfo = packageInfo.applicationInfo;
        appInfo.sourceDir = apkFile.getAbsolutePath();
        appInfo.publicSourceDir = apkFile.getAbsolutePath();

        // O parent ClassLoader DEVE ser o do nosso app para resolver as interfaces Tachiyomi
        PathClassLoader classLoader = new PathClassLoader(
            apkFile.getAbsolutePath(),
            context.getClassLoader()
        );

        android.os.Bundle meta = appInfo.metaData;
        String className = meta != null ? meta.getString("tachiyomi.extension.class") : null;
        String factoryClass = meta != null ? meta.getString("tachiyomi.extension.factory") : null;

        List<Source> results = new ArrayList<>();

        if (className != null && !className.isEmpty()) {
            // Suporte a nomes relativos ao pacote (ex: ".SomeSource")
            if (className.startsWith(".")) {
                className = packageInfo.packageName + className;
            }
            try {
                Class<?> clazz = classLoader.loadClass(className);
                Object obj = clazz.getDeclaredConstructor().newInstance();
                if (obj instanceof Source) {
                    Source source = (Source) obj;
                    String sid = String.valueOf(source.getId());
                    loadedSources.put(sid, source);
                    sourceToPkg.put(sid, packageInfo.packageName);
                    results.add(source);
                    Log.i(TAG, "Fonte carregada: " + source.getName()
                        + " id=" + sid + " lang=" + source.getLang()
                        + " pkg=" + packageInfo.packageName);
                } else {
                    Log.w(TAG, "Classe " + className + " não implementa Source");
                }
            } catch (ClassNotFoundException e) {
                Log.e(TAG, "Classe não encontrada no APK: " + className, e);
                throw new IllegalStateException("Extensão incompatível: classe " + className + " não encontrada no APK.");
            } catch (ClassCastException e) {
                Log.e(TAG, "ClassCastException ao carregar " + className, e);
                throw new IllegalStateException("Extensão incompatível com esta versão do OmniYomi: " + className);
            }
        } else if (factoryClass != null && !factoryClass.isEmpty()) {
            if (factoryClass.startsWith(".")) {
                factoryClass = packageInfo.packageName + factoryClass;
            }
            try {
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
                        Log.i(TAG, "Fonte (Factory): " + s.getName()
                            + " id=" + sid + " lang=" + s.getLang());
                    }
                } else {
                    Log.w(TAG, "Classe factory " + factoryClass + " não implementa SourceFactory");
                }
            } catch (ClassNotFoundException e) {
                throw new IllegalStateException("Factory não encontrada no APK: " + factoryClass);
            } catch (ClassCastException e) {
                throw new IllegalStateException("Factory incompatível com esta versão do OmniYomi: " + factoryClass);
            }
        } else {
            throw new IllegalStateException(
                "APK não contém 'tachiyomi.extension.class' nem 'tachiyomi.extension.factory' no manifesto.\n"
                + "Este APK pode não ser uma extensão Tachiyomi/Mihon válida."
            );
        }

        if (results.isEmpty()) {
            throw new IllegalStateException(
                "APK carregado mas nenhuma fonte foi registrada. Verifique se o APK é compatível."
            );
        }

        return results;
    }

    /**
     * Baixa o APK da extensão do URL informado (GitHub Releases ou similar).
     * Não depende de servidor — faz requisição HTTP direta do dispositivo.
     */
    public File downloadExtension(String apkUrl, String pkgName) throws IOException {
        File apkFile = new File(extensionsDir, pkgName + ".apk");
        URL url = new URL(apkUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 OmniYomi-Android/1.1.4");
        conn.setRequestProperty("Accept", "application/vnd.android.package-archive");
        conn.setConnectTimeout(25000);
        conn.setReadTimeout(60000);  // APKs podem ser grandes
        conn.setInstanceFollowRedirects(true);
        conn.connect();

        int code = conn.getResponseCode();
        if (code >= 400) {
            conn.disconnect();
            throw new IOException("HTTP " + code + " ao baixar extensão de: " + apkUrl);
        }

        try (InputStream in = new BufferedInputStream(conn.getInputStream(), 16384);
             OutputStream out = new BufferedOutputStream(new FileOutputStream(apkFile), 16384)) {
            byte[] buf = new byte[16384];
            int len;
            while ((len = in.read(buf)) != -1) {
                out.write(buf, 0, len);
            }
            out.flush();
        } finally {
            conn.disconnect();
        }

        Log.i(TAG, "APK baixado: " + apkFile.getAbsolutePath()
            + " (" + apkFile.length() + " bytes)");
        return apkFile;
    }

    public synchronized boolean uninstallExtension(String pkgName) {
        File apkFile = new File(extensionsDir, pkgName + ".apk");
        if (apkFile.exists()) apkFile.delete();

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
        Log.i(TAG, "Extensão desinstalada: " + pkgName + " (" + toRemove.size() + " fontes removidas)");
        return true;
    }

    public Source getSource(String sourceId) {
        Source s = loadedSources.get(sourceId);
        if (s == null) {
            Log.w(TAG, "Fonte não encontrada: " + sourceId
                + ". Fontes disponíveis: " + loadedSources.keySet());
        }
        return s;
    }

    public Collection<Source> getAllSources() {
        return loadedSources.values();
    }

    // ─── Execução direta das extensões — sem servidor ───────────────────────

    public MangasPage getPopularManga(String sourceId, int page) throws Exception {
        Source s = requireSource(sourceId);
        if (!(s instanceof CatalogueSource)) {
            throw new IllegalArgumentException("[" + sourceId + "] A extensão '"
                + s.getName() + "' não implementa CatalogueSource.");
        }
        CatalogueSource cat = (CatalogueSource) s;
        try {
            MangasPage result = cat.fetchPopularManga(page).toBlocking().first();
            Log.i(TAG, "getPopularManga(" + s.getName() + ", p" + page + "): "
                + (result.getMangas() != null ? result.getMangas().size() : 0) + " obras");
            return result;
        } catch (Exception e) {
            Log.e(TAG, "Falha em getPopularManga para " + s.getName(), e);
            throw new Exception("[" + s.getName() + "] Falha ao buscar catálogo: " + e.getMessage(), e);
        }
    }

    public MangasPage searchManga(String sourceId, String query, int page) throws Exception {
        Source s = requireSource(sourceId);
        if (!(s instanceof CatalogueSource)) {
            throw new IllegalArgumentException("[" + sourceId + "] Extensão não suporta busca.");
        }
        CatalogueSource cat = (CatalogueSource) s;
        try {
            return cat.fetchSearchManga(page, query, new FilterList()).toBlocking().first();
        } catch (Exception e) {
            Log.e(TAG, "Falha em searchManga para " + s.getName(), e);
            throw new Exception("[" + s.getName() + "] Falha na busca: " + e.getMessage(), e);
        }
    }

    public SManga getMangaDetails(String sourceId, String mangaUrl) throws Exception {
        Source s = requireSource(sourceId);
        SManga manga = SManga.create();
        manga.setUrl(mangaUrl);
        try {
            return s.fetchMangaDetails(manga).toBlocking().first();
        } catch (Exception e) {
            Log.e(TAG, "Falha em getMangaDetails para " + s.getName(), e);
            throw new Exception("[" + s.getName() + "] Falha ao carregar detalhes: " + e.getMessage(), e);
        }
    }

    public List<SChapter> getChapterList(String sourceId, String mangaUrl) throws Exception {
        Source s = requireSource(sourceId);
        SManga manga = SManga.create();
        manga.setUrl(mangaUrl);
        try {
            List<SChapter> chapters = s.fetchChapterList(manga).toBlocking().first();
            Log.i(TAG, "getChapterList(" + s.getName() + "): " + chapters.size() + " capítulos");
            return chapters;
        } catch (Exception e) {
            Log.e(TAG, "Falha em getChapterList para " + s.getName(), e);
            throw new Exception("[" + s.getName() + "] Falha ao carregar capítulos: " + e.getMessage(), e);
        }
    }

    public List<Page> getPageList(String sourceId, String chapterUrl) throws Exception {
        Source s = requireSource(sourceId);
        SChapter ch = SChapter.create();
        ch.setUrl(chapterUrl);
        try {
            List<Page> pages = s.fetchPageList(ch).toBlocking().first();
            Log.i(TAG, "getPageList(" + s.getName() + "): " + pages.size() + " páginas");
            return pages;
        } catch (Exception e) {
            Log.e(TAG, "Falha em getPageList para " + s.getName(), e);
            throw new Exception("[" + s.getName() + "] Falha ao carregar páginas: " + e.getMessage(), e);
        }
    }

    /** Lança exceção clara se a fonte não estiver carregada */
    private Source requireSource(String sourceId) throws IllegalArgumentException {
        Source s = loadedSources.get(sourceId);
        if (s == null) {
            String available = loadedSources.isEmpty()
                ? "nenhuma extensão instalada"
                : "IDs disponíveis: " + loadedSources.keySet();
            throw new IllegalArgumentException(
                "Extensão não encontrada (ID: " + sourceId + "). "
                + "Instale a extensão primeiro. " + available
            );
        }
        return s;
    }

    // ─── Download offline ────────────────────────────────────────────────────

    public boolean downloadChapter(String sourceId, String mangaId, String chapterId, List<String> imageUrls) throws Exception {
        File chDir = new File(downloadsDir,
            sanitize(sourceId) + "/" + sanitize(mangaId) + "/" + sanitize(chapterId));
        if (!chDir.exists()) chDir.mkdirs();

        OkHttpClient client = NetworkHelper.getClient();
        int downloaded = 0;

        for (int i = 0; i < imageUrls.size(); i++) {
            String imgUrl = imageUrls.get(i);
            File pageFile = new File(chDir, String.format(Locale.US, "%04d.jpg", i + 1));
            if (pageFile.exists() && pageFile.length() > 0) {
                downloaded++;
                continue;
            }

            Request req = new Request.Builder()
                .url(imgUrl)
                .header("User-Agent", "Mozilla/5.0 OmniYomi-Android")
                .header("Referer", imgUrl)
                .build();

            try (Response res = client.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) {
                    Log.w(TAG, "Falha ao baixar página " + (i+1) + ": HTTP " + res.code());
                    continue;
                }
                try (InputStream in = res.body().byteStream();
                     OutputStream out = new FileOutputStream(pageFile)) {
                    byte[] buf = new byte[8192];
                    int len;
                    while ((len = in.read(buf)) != -1) out.write(buf, 0, len);
                }
                downloaded++;
            } catch (IOException e) {
                Log.w(TAG, "Erro ao baixar página " + (i+1) + ": " + e.getMessage());
            }
        }

        Log.i(TAG, "Download concluído: " + downloaded + "/" + imageUrls.size() + " páginas");
        return downloaded > 0;
    }

    public List<String> getOfflinePages(String sourceId, String mangaId, String chapterId) {
        File chDir = new File(downloadsDir,
            sanitize(sourceId) + "/" + sanitize(mangaId) + "/" + sanitize(chapterId));
        if (!chDir.exists()) return Collections.emptyList();

        File[] files = chDir.listFiles(
            (dir, name) -> name.endsWith(".jpg") || name.endsWith(".png") || name.endsWith(".webp")
        );
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
