package com.omniyomi.app;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
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
        // Reconstruir o mapa a partir dos APKs privados persistidos no dispositivo.
        loadedSources.clear();
        sourceToPkg.clear();

        File[] apks = extensionsDir.listFiles((dir, name) -> name.endsWith(".apk"));
        if (apks == null) return;
        Arrays.sort(apks, Comparator.comparing(File::getName));
        for (File apk : apks) {
            try {
                String expectedPackage = apk.getName().substring(0, apk.getName().length() - 4);
                loadExtensionApk(apk, expectedPackage);
            } catch (Exception e) {
                Log.e(TAG, "Extensão não carregada: " + apk.getName() + " — " + e.getMessage(), e);
            }
        }
        Log.i(TAG, "Varredura concluída: " + loadedSources.size() + " fontes carregadas.");
    }

    /**
     * Compatibilidade com o formato clássico: uma extensão pode declarar uma classe
     * Source ou uma classe gerada que implementa SourceFactory. O campo
     * tachiyomi.extension.class também pode conter várias classes separadas por ';'.
     */
    public synchronized List<Source> loadExtensionApk(File apkFile) throws Exception {
        return loadExtensionApk(apkFile, null);
    }

    public synchronized List<Source> loadExtensionApk(File apkFile, String expectedPackageName) throws Exception {
        if (apkFile == null || !apkFile.isFile() || apkFile.length() < 4) {
            throw new IllegalStateException("Arquivo APK inexistente ou vazio.");
        }

        PackageManager pm = context.getPackageManager();
        int flags = PackageManager.GET_META_DATA | PackageManager.GET_CONFIGURATIONS;
        PackageInfo packageInfo = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (packageInfo == null || packageInfo.applicationInfo == null || packageInfo.packageName == null) {
            throw new IllegalStateException("APK inválido ou sem metadados Android: " + apkFile.getName());
        }
        if (expectedPackageName != null && !expectedPackageName.equals(packageInfo.packageName)) {
            throw new IllegalStateException(
                "Package name divergente. Esperado: " + expectedPackageName
                + "; APK contém: " + packageInfo.packageName
            );
        }

        ApplicationInfo appInfo = packageInfo.applicationInfo;
        appInfo.sourceDir = apkFile.getAbsolutePath();
        appInfo.publicSourceDir = apkFile.getAbsolutePath();
        android.os.Bundle meta = appInfo.metaData;
        if (meta == null) {
            throw new IllegalStateException("O manifesto do APK não contém metadados de extensão.");
        }

        // Esta build contém a ABI legada Tachiyomi 1.4 (interfaces RxJava).
        // TachiyomiX 1.6 mudou Source para métodos suspend/coroutines e modelos Kotlin.
        // Não marcar essas extensões como instaladas: elas exigem o runtime 1.6 completo.
        String extensionLib = meta.getString("tachiyomix.extensionLib");
        if (extensionLib != null && !extensionLib.trim().isEmpty()
            && !extensionLib.trim().startsWith("1.4")) {
            throw new IllegalStateException(
                "API de extensão incompatível: este APK declara TachiyomiX "
                + extensionLib + ", mas esta versão do OmniYomi só implementa a ABI legada 1.4. "
                + "A extensão não foi registrada como instalada."
            );
        }

        String classMetadata = meta.getString("tachiyomi.extension.class");
        String factoryMetadata = meta.getString("tachiyomi.extension.factory");

        List<String> classNames = new ArrayList<>();
        if (classMetadata != null) {
            for (String candidate : classMetadata.split(";")) {
                String name = candidate.trim();
                if (!name.isEmpty() && !classNames.contains(name)) classNames.add(name);
            }
        }
        if (factoryMetadata != null && !factoryMetadata.trim().isEmpty()
            && !classNames.contains(factoryMetadata.trim())) {
            classNames.add(factoryMetadata.trim());
        }
        if (classNames.isEmpty()) {
            throw new IllegalStateException(
                "APK sem tachiyomi.extension.class ou tachiyomi.extension.factory. "
                + "Não é um pacote de extensão reconhecido."
            );
        }

        ClassLoader classLoader = createExtensionClassLoader(apkFile.getAbsolutePath());
        List<Source> results = new ArrayList<>();
        Set<String> resultIds = new HashSet<>();

        for (String declaredName : classNames) {
            String className = declaredName.startsWith(".")
                ? packageInfo.packageName + declaredName
                : declaredName;

            try {
                Class<?> clazz = Class.forName(className, false, classLoader);
                Object instance = clazz.getDeclaredConstructor().newInstance();

                if (instance instanceof Source) {
                    addLoadedSource((Source) instance, packageInfo.packageName, results, resultIds);
                } else if (instance instanceof SourceFactory) {
                    List<Source> produced = ((SourceFactory) instance).createSources();
                    if (produced == null || produced.isEmpty()) {
                        throw new IllegalStateException("SourceFactory não retornou nenhuma fonte: " + className);
                    }
                    for (Source source : produced) {
                        addLoadedSource(source, packageInfo.packageName, results, resultIds);
                    }
                } else {
                    throw new IllegalStateException(
                        "A classe " + className + " não implementa Source nem SourceFactory."
                    );
                }
            } catch (Throwable e) {
                Log.e(TAG, "Falha ao inicializar classe de extensão: " + className, e);
                throw new IllegalStateException(
                    "Falha ao carregar " + className + ": " + rootMessage(e), e
                );
            }
        }

        if (results.isEmpty()) {
            throw new IllegalStateException("APK analisado, mas nenhuma fonte executável foi registrada.");
        }

        // Só publicar fontes no registry após carregar todas as classes com sucesso.
        for (Source source : results) {
            String id = String.valueOf(source.getId());
            Source existing = loadedSources.get(id);
            String existingPkg = sourceToPkg.get(id);
            if (existing != null && existingPkg != null && !existingPkg.equals(packageInfo.packageName)) {
                throw new IllegalStateException(
                    "Conflito de Source ID " + id + " entre " + existingPkg + " e " + packageInfo.packageName
                );
            }
        }
        for (Source source : results) {
            String id = String.valueOf(source.getId());
            loadedSources.put(id, source);
            sourceToPkg.put(id, packageInfo.packageName);
            Log.i(TAG, "Fonte carregada: " + source.getName() + " id=" + id
                + " lang=" + source.getLang() + " pkg=" + packageInfo.packageName);
        }

        return results;
    }

    private ClassLoader createExtensionClassLoader(String apkPath) {
        // Delegate-last impede que dependências empacotadas pela extensão sejam
        // substituídas prematuramente por versões incompatíveis do host. As APIs
        // compartilhadas (eu.kanade.tachiyomi.*) ainda resolvem pelo parent.
        if (Build.VERSION.SDK_INT >= 27) {
            try {
                return new dalvik.system.DelegateLastClassLoader(
                    apkPath, null, context.getClassLoader()
                );
            } catch (Throwable e) {
                Log.w(TAG, "DelegateLastClassLoader indisponível; usando PathClassLoader", e);
            }
        }
        return new PathClassLoader(apkPath, context.getClassLoader());
    }

    private void addLoadedSource(
        Source source,
        String packageName,
        List<Source> results,
        Set<String> resultIds
    ) {
        if (source == null) throw new IllegalStateException("A extensão retornou uma fonte nula.");
        String id = String.valueOf(source.getId());
        if (id.equals("0") || id.equals("-1")) {
            throw new IllegalStateException("Source ID inválido retornado por " + source.getName());
        }
        if (!resultIds.add(id)) {
            throw new IllegalStateException("Source ID duplicado dentro do APK: " + id);
        }
        results.add(source);
    }

    private String rootMessage(Throwable error) {
        Throwable root = error;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        return root.getClass().getSimpleName() + ": " + String.valueOf(root.getMessage());
    }

    /**
     * Baixa o APK da extensão do URL informado (GitHub Releases ou similar).
     * Não depende de servidor — faz requisição HTTP direta do dispositivo.
     */
    public File downloadExtension(String apkUrl, String pkgName) throws IOException {
        if (pkgName == null || !pkgName.matches("[A-Za-z0-9_.]+")) {
            throw new IOException("Package name inválido.");
        }
        if (apkUrl == null || !(apkUrl.startsWith("https://"))) {
            throw new IOException("A URL do APK deve utilizar HTTPS.");
        }

        File target = new File(extensionsDir, pkgName + ".apk");
        File temp = new File(extensionsDir, pkgName + ".apk.part");
        HttpURLConnection conn = (HttpURLConnection) new URL(apkUrl).openConnection();
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 OmniYomi-Android/1.1.6");
        conn.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
        conn.setConnectTimeout(25000);
        conn.setReadTimeout(60000);
        conn.setInstanceFollowRedirects(true);
        conn.connect();

        try {
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IOException("HTTP " + code + " ao baixar extensão: " + apkUrl);
            }
            try (InputStream in = new BufferedInputStream(conn.getInputStream(), 16384);
                 OutputStream out = new BufferedOutputStream(new FileOutputStream(temp), 16384)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                out.flush();
            }

            if (!temp.isFile() || temp.length() < 4) {
                throw new IOException("O download do APK ficou incompleto.");
            }
            PackageInfo info = context.getPackageManager().getPackageArchiveInfo(
                temp.getAbsolutePath(), PackageManager.GET_META_DATA
            );
            if (info == null || !pkgName.equals(info.packageName)) {
                throw new IOException("O arquivo baixado não corresponde ao pacote " + pkgName + ".");
            }

            if (target.exists() && !target.delete()) {
                throw new IOException("Não foi possível substituir a versão anterior da extensão.");
            }
            if (!temp.renameTo(target)) {
                throw new IOException("Não foi possível finalizar o armazenamento do APK.");
            }

            Log.i(TAG, "APK validado e armazenado: " + target.getAbsolutePath()
                + " (" + target.length() + " bytes)");
            return target;
        } finally {
            conn.disconnect();
            if (temp.exists()) temp.delete();
        }
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

    public MangasPage getLatestManga(String sourceId, int page) throws Exception {
        Source source = requireSource(sourceId);
        if (!(source instanceof CatalogueSource)) {
            throw new IllegalArgumentException("A fonte " + source.getName() + " não oferece catálogo.");
        }
        CatalogueSource catalogue = (CatalogueSource) source;
        if (!catalogue.getSupportsLatest()) {
            throw new IllegalArgumentException("A fonte " + source.getName() + " não oferece lançamentos recentes.");
        }
        try {
            MangasPage result = catalogue.fetchLatestUpdates(page).toBlocking().first();
            Log.i(TAG, "getLatestManga(" + source.getName() + ", p" + page + "): "
                + (result.getMangas() != null ? result.getMangas().size() : 0) + " obras");
            return result;
        } catch (Exception e) {
            Log.e(TAG, "Falha em getLatestManga para " + source.getName(), e);
            throw new Exception("[" + source.getName() + "] Falha ao buscar lançamentos: " + e.getMessage(), e);
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

    /** Lista os capítulos armazenados fisicamente no aparelho. */
    public List<Map<String, Object>> getDownloadedChapters() {
        List<Map<String, Object>> result = new ArrayList<>();
        File[] sourceDirs = downloadsDir.listFiles(File::isDirectory);
        if (sourceDirs == null) return result;

        for (File sourceDir : sourceDirs) {
            File[] mangaDirs = sourceDir.listFiles(File::isDirectory);
            if (mangaDirs == null) continue;
            for (File mangaDir : mangaDirs) {
                File[] chapterDirs = mangaDir.listFiles(File::isDirectory);
                if (chapterDirs == null) continue;
                for (File chapterDir : chapterDirs) {
                    File[] pages = chapterDir.listFiles((dir, name) ->
                        name.endsWith(".jpg") || name.endsWith(".jpeg")
                        || name.endsWith(".png") || name.endsWith(".webp"));
                    if (pages == null || pages.length == 0) continue;

                    long bytes = 0;
                    for (File page : pages) bytes += page.length();
                    Map<String, Object> item = new HashMap<>();
                    item.put("sourceId", sourceDir.getName());
                    item.put("mangaId", mangaDir.getName());
                    item.put("chapterId", chapterDir.getName());
                    item.put("pages", pages.length);
                    item.put("totalBytes", bytes);
                    result.add(item);
                }
            }
        }
        return result;
    }

    public long getDownloadsStorageBytes() {
        return directorySize(downloadsDir);
    }

    private long directorySize(File directory) {
        if (directory == null || !directory.exists()) return 0;
        if (directory.isFile()) return directory.length();
        long total = 0;
        File[] children = directory.listFiles();
        if (children != null) for (File child : children) total += directorySize(child);
        return total;
    }

    public boolean deleteOfflineChapterById(String chapterId) {
        if (chapterId == null || chapterId.trim().isEmpty()) return false;
        File[] sourceDirs = downloadsDir.listFiles(File::isDirectory);
        if (sourceDirs == null) return false;
        boolean deleted = false;
        for (File sourceDir : sourceDirs) {
            File[] mangaDirs = sourceDir.listFiles(File::isDirectory);
            if (mangaDirs == null) continue;
            for (File mangaDir : mangaDirs) {
                File chapterDir = new File(mangaDir, sanitize(chapterId));
                if (chapterDir.exists() && chapterDir.isDirectory()) {
                    deleteRecursively(chapterDir);
                    deleted = true;
                }
            }
        }
        return deleted;
    }

    public int deleteAllOfflineDownloads() {
        File[] sourceDirs = downloadsDir.listFiles(File::isDirectory);
        if (sourceDirs == null) return 0;
        int deleted = 0;
        for (File sourceDir : sourceDirs) {
            deleteRecursively(sourceDir);
            deleted++;
        }
        return deleted;
    }

    private void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        if (!file.delete()) Log.w(TAG, "Não foi possível excluir arquivo local: " + file.getAbsolutePath());
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
