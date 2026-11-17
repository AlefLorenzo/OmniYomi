import axios from 'axios';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
import { decodeProtobufExtensionList, decodeProtobufRepoIndex } from './ProtobufRepoDecoder.js';
import { suwayomiService } from './SuwayomiService.js';
import { RepoExtension, RepoExtensionSource } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSIONS_DIR = path.resolve(process.env.OMNIYOMI_DATA_DIR || path.resolve(__dirname, '../../../data'), 'extensions');
const CACHE_DIR = path.join(EXTENSIONS_DIR, 'cache');
const EXTRACTED_DIR = path.join(EXTENSIONS_DIR, 'extracted');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(EXTRACTED_DIR)) fs.mkdirSync(EXTRACTED_DIR, { recursive: true });

export class RepoManager {
  private cache: Map<string, { extensions: RepoExtension[]; timestamp: number }> = new Map();
  private CACHE_TTL = 30 * 60 * 1000; // 30 minutes in memory

  public async fetchRepoExtensions(repoUrl: string): Promise<RepoExtension[]> {
    const cleanUrl = repoUrl.trim();
    const cached = this.cache.get(cleanUrl);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) return cached.extensions;

    const extractedList = db.getExtractedExtensions();
    const extractedPkgs = new Set(extractedList.map((entry: any) => entry.pkg));
    const pendingUrls = this.resolveCandidateUrls(cleanUrl);
    const visited = new Set<string>();
    let lastError: any = null;

    while (pendingUrls.length > 0) {
      const url = pendingUrls.shift()!;
      if (!url || visited.has(url)) continue;
      visited.add(url);

      try {
        let extensions: RepoExtension[] = [];

        if (url.endsWith('.pb')) {
          const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'OmniYomi-Mihon-Extension-Store/1.1' },
          });
          const decoded = decodeProtobufRepoIndex(Buffer.from(response.data), url);
          extensions = decoded.extensions;

          if (extensions.length === 0 && decoded.extensionListUrl) {
            const listResponse = await axios.get(decoded.extensionListUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
              headers: { 'User-Agent': 'OmniYomi-Mihon-Extension-Store/1.1' },
            });
            const listBuffer = Buffer.from(listResponse.data);
            const firstByte = listBuffer.toString('utf8').trimStart()[0];
            if (firstByte === '{') {
              const listJson = JSON.parse(listBuffer.toString('utf8'));
              extensions = this.parseModernJson({
                name: decoded.name,
                signingKey: decoded.signingKey,
                extensionList: listJson.extensionList || listJson,
              }, url, extractedPkgs);
            } else {
              extensions = decodeProtobufExtensionList(listBuffer, url, decoded.name, decoded.signingKey);
            }
          }
        } else {
          const response = await axios.get(url, {
            timeout: 30000,
            headers: {
              'User-Agent': 'OmniYomi-Mihon-Extension-Store/1.1',
              'Accept': 'application/json',
            },
          });
          const data = response.data;
          const basePath = url.substring(0, url.lastIndexOf('/'));

          if (data && !Array.isArray(data) && typeof data === 'object' && typeof data.index_v2 === 'string') {
            const indexV2 = new URL(data.index_v2, url).toString();
            if (!visited.has(indexV2)) pendingUrls.unshift(indexV2);
            continue;
          }

          if (data && !Array.isArray(data) && typeof data === 'object' &&
              !(data.extensionList?.extensions?.length) && typeof data.extensionListUrl === 'string') {
            const listUrl = new URL(data.extensionListUrl, url).toString();
            const listResponse = await axios.get(listUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
              headers: { 'User-Agent': 'OmniYomi-Mihon-Extension-Store/1.1' },
            });
            extensions = decodeProtobufExtensionList(Buffer.from(listResponse.data), url, data.name, data.signingKey);
          } else if (Array.isArray(data)) {
            const outdatedStub = data.length <= 2 && data.some((item: any) =>
              /mihon|outdated|update to/i.test(String(item?.name || ''))
            );
            if (outdatedStub && url.endsWith('/index.min.json')) {
              const repoJsonUrl = new URL('repo.json', url).toString();
              if (!visited.has(repoJsonUrl)) pendingUrls.unshift(repoJsonUrl);
              continue;
            }
            extensions = this.parseLegacyJson(data, url, basePath, new URL(url).hostname, extractedPkgs);
          } else if (data && typeof data === 'object') {
            extensions = this.parseModernJson(data, url, extractedPkgs);
          }
        }

        if (extensions.length > 0) {
          for (const extension of extensions) {
            extension.isExtracted = extractedPkgs.has(extension.pkg);
            extension.isInstalled = extractedPkgs.has(extension.pkg);
            extension.repoUrl = cleanUrl;
          }
          this.cache.set(cleanUrl, { extensions, timestamp: Date.now() });
          db.updateRepoSynced(cleanUrl);
          return extensions;
        }
      } catch (error: any) {
        lastError = error;
      }
    }

    throw new Error('Falha ao extrair extensões de ' + cleanUrl + ': ' +
      (lastError?.message || 'Nenhuma extensão encontrada nos formatos aceitos'));
  }

  private resolveCandidateUrls(url: string): string[] {
    const urls = [url];
    if (url.endsWith('/')) {
      urls.push(url + 'index.pb', url + 'index.json', url + 'index.min.json');
    } else if (url.endsWith('index.min.json')) {
      urls.push(url.replace('index.min.json', 'repo.json'));
      urls.push(url.replace('index.min.json', 'index.json'));
      urls.push(url.replace('index.min.json', 'index.pb'));
    } else if (url.endsWith('index.pb')) {
      urls.push(url.replace('index.pb', 'index.json'));
      urls.push(url.replace('index.pb', 'index.min.json'));
    } else if (url.endsWith('index.json')) {
      urls.push(url.replace('index.json', 'repo.json'));
      urls.push(url.replace('index.json', 'index.pb'));
      urls.push(url.replace('index.json', 'index.min.json'));
    }
    return urls;
  }

  private parseLegacyJson(data: any[], url: string, basePath: string, hostname: string, extractedPkgs: Set<string>): RepoExtension[] {
    const extensions: RepoExtension[] = [];

    for (const item of data) {
      const pkg = item.pkg || item.packageName;
      if (!pkg) continue;

      let apkUrl = item.apk || item.apkUrl || '';
      if (apkUrl && !apkUrl.startsWith('http')) {
        apkUrl = `${basePath}/apk/${apkUrl}`;
      }

      let iconUrl = item.icon || item.iconUrl || '';
      if (!iconUrl) {
        iconUrl = `${basePath}/icon/${pkg}.png`;
      } else if (!iconUrl.startsWith('http')) {
        iconUrl = `${basePath}/${iconUrl}`;
      }

      const sources: RepoExtensionSource[] = (item.sources || []).map((s: any) => ({
        id: String(s.id),
        name: s.name || item.name,
        lang: s.lang || s.language || item.lang || 'all',
        baseUrl: s.baseUrl || s.homeUrl || '',
      }));

      extensions.push({
        id: pkg,
        pkg,
        name: item.name,
        version: item.versionName || item.version || '1.0.0',
        extensionLib: String(item.extensionLib || '1.4'),
        versionCode: Number.parseInt(String(item.versionCode || item.code || '0'), 10) || 0,
        lang: item.lang || item.language || 'all',
        iconUrl,
        apkUrl,
        isNsfw: item.nsfw === 1 || Boolean(item.contentWarning?.includes('NSFW')),
        repoUrl: url,
        repoName: hostname,
        sources,
        isInstalled: extractedPkgs.has(pkg),
        isExtracted: extractedPkgs.has(pkg),
      });
    }

    return extensions;
  }

  private parseModernJson(data: any, url: string, extractedPkgs: Set<string>): RepoExtension[] {
    const extensions: RepoExtension[] = [];
    const urlObj = new URL(url);
    const basePath = url.substring(0, url.lastIndexOf('/'));
    const repoName = data.name || urlObj.hostname;
    const list = data.extensionList?.extensions || data.extensions || [];

    for (const item of list) {
      const pkg = item.packageName || item.pkg;
      if (!pkg) continue;

      let apkUrl = item.resources?.apkUrl || item.apk || '';
      if (apkUrl && !apkUrl.startsWith('http')) {
        apkUrl = `${basePath}/${apkUrl}`;
      }

      let iconUrl = item.resources?.iconUrl || item.icon || '';
      if (!iconUrl) {
        iconUrl = `${basePath}/icon/${pkg}.png`;
      } else if (!iconUrl.startsWith('http')) {
        iconUrl = `${basePath}/${iconUrl}`;
      }

      const sources: RepoExtensionSource[] = (item.sources || []).map((s: any) => ({
        id: String(s.id),
        name: s.name || item.name,
        lang: s.lang || s.language || 'all',
        baseUrl: s.baseUrl || s.homeUrl || '',
      }));

      extensions.push({
        id: pkg,
        pkg,
        name: item.name,
        version: item.versionName || item.version || '1.0.0',
        extensionLib: String(item.extensionLib || '1.4'),
        versionCode: Number.parseInt(String(item.versionCode || item.code || '0'), 10) || 0,
        lang: sources[0]?.lang || 'all',
        iconUrl,
        apkUrl,
        isNsfw: Boolean(item.contentWarning?.includes('NSFW')),
        repoUrl: url,
        repoName,
        sources,
        signingKey: typeof data.signingKey === 'string' ? data.signingKey : undefined,
        isInstalled: extractedPkgs.has(pkg),
        isExtracted: extractedPkgs.has(pkg),
      });
    }

    return extensions;
  }

  private getInstalledStatus(pkg: string): { valid: boolean; version?: string; versionCode?: number; extractedPath?: string } | null {
    const record = db.getExtractedExtensions().find((entry: any) => entry.pkg === pkg);
    if (!record) return null;

    const extractedPath = path.join(EXTRACTED_DIR, pkg);
    const manifestPath = path.join(extractedPath, 'manifest.json');
    const apkPath = path.join(CACHE_DIR, `${pkg}.apk`);
    let manifest: any = null;
    try {
      if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch { manifest = null; }

    const dexValid = fs.existsSync(extractedPath) && fs.readdirSync(extractedPath).some((name) =>
      /^classes(?:\d+)?\.dex$/i.test(name) &&
      fs.statSync(path.join(extractedPath, name)).isFile() &&
      fs.statSync(path.join(extractedPath, name)).size > 0
    );
    let apkValid = false;
    try {
      if (fs.existsSync(apkPath) && fs.statSync(apkPath).size > 1024) {
        const zip = new AdmZip(apkPath);
        apkValid = zip.getEntries().some((entry) => /^classes(?:\d+)?\.dex$/i.test(entry.entryName));
      }
    } catch { apkValid = false; }

    return {
      valid: Boolean(manifest?.pkg === pkg && dexValid && apkValid),
      version: manifest?.version || record.version,
      versionCode: Number.parseInt(String(manifest?.versionCode || '0'), 10) || 0,
      extractedPath,
    };
  }

  public async getAllExtensions(query?: string, lang?: string, repoFilter?: string): Promise<RepoExtension[]> {
    const repos = db.getExtensionRepos().filter((r: any) =>
      r.enabled && (!repoFilter || repoFilter === 'all' || r.url === repoFilter)
    );
    if (repos.length === 0) {
      throw new Error(repoFilter && repoFilter !== 'all'
        ? 'O repositório selecionado não está habilitado ou não existe.'
        : 'Nenhum repositório de extensões está habilitado. Adicione ou ative um repositório na aba Repositórios.');
    }

    const fetched = await Promise.allSettled(repos.map(async (repo: any) => ({
      repo,
      extensions: await this.fetchRepoExtensions(repo.url),
    })));
    const allExtensions: RepoExtension[] = [];
    const failures: string[] = [];
    for (let index = 0; index < fetched.length; index++) {
      const result = fetched[index];
      if (result.status === 'fulfilled') {
        allExtensions.push(...result.value.extensions);
      } else {
        const reason = result.reason?.message || String(result.reason);
        failures.push(repos[index].name + ': ' + reason);
        console.warn('[RepoManager] Um repositório não pôde ser sincronizado:', reason);
      }
    }
    if (allExtensions.length === 0 && failures.length > 0) {
      throw new Error('Não foi possível carregar nenhum catálogo de extensões. ' + failures.join(' | '));
    }

    // Android package names are unique at install time. Keep one store candidate per package
    // and prefer the greatest published versionCode to avoid duplicate React keys and signature conflicts.
    const uniqueMap = new Map<string, RepoExtension>();
    for (const ext of allExtensions) {
      const previous = uniqueMap.get(ext.pkg);
      if (!previous || (ext.versionCode || 0) > (previous.versionCode || 0)) {
        uniqueMap.set(ext.pkg, ext);
      }
    }

    let filtered = Array.from(uniqueMap.values());
    for (const ext of filtered) {
      const installed = this.getInstalledStatus(ext.pkg);
      ext.isInstalled = Boolean(installed?.valid);
      ext.isExtracted = Boolean(installed?.valid);
      ext.installedVersion = installed?.version;
      ext.updateAvailable = Boolean(installed?.valid && (ext.versionCode || 0) > (installed.versionCode || 0));
      const lib = String(ext.extensionLib || '1.4').trim();
      ext.isCompatible = ['1.4', '1.5', '1.6'].includes(lib);
      ext.compatibilityReason = ext.isCompatible
        ? ''
        : `A extensão usa a API ${lib || 'desconhecida'}; este runtime valida as APIs 1.4–1.6.`;
    }

    if (lang && lang !== 'all') {
      const l = lang.toLowerCase();
      filtered = filtered.filter(e =>
        e.lang.toLowerCase() === l ||
        e.lang.toLowerCase() === 'all' ||
        e.sources.some(s => s.lang.toLowerCase().startsWith(l))
      );
    }

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.pkg.toLowerCase().includes(q) ||
        e.repoName.toLowerCase().includes(q) ||
        e.sources.some(s => s.name.toLowerCase().includes(q))
      );
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Downloads APK, extracts dex, icons, manifest and saves extracted extension
  public async extractApkExtension(pkg: string, apkUrl: string, repoUrl: string): Promise<any> {
    if (!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(pkg)) {
      throw new Error('Identificador de pacote inválido.');
    }
    if (!apkUrl) throw new Error('URL do arquivo APK não fornecida.');

    const metadata = (await this.getAllExtensions()).find((extension) =>
      extension.pkg === pkg && (!repoUrl || extension.repoUrl === repoUrl)
    );
    if (!metadata) throw new Error('Extensão não encontrada nos repositórios habilitados. Atualize o catálogo.');
    if (metadata.isCompatible === false) {
      throw new Error(metadata.compatibilityReason || 'Esta extensão não é compatível com o runtime atual.');
    }

    const installed = this.getInstalledStatus(pkg);
    if (installed?.valid && !metadata.updateAvailable) {
      return {
        pkg,
        name: metadata.name,
        version: installed.version,
        skipped: true,
        reason: 'A extensão já está instalada e os arquivos locais passaram na validação.',
      };
    }

    const apkPath = path.join(CACHE_DIR, `${pkg}.apk`);
    const targetExtractDir = path.join(EXTRACTED_DIR, pkg);
    const stagingDir = path.join(EXTRACTED_DIR, `.${pkg}.staging-${process.pid}-${Date.now()}`);
    const tempApkPath = `${apkPath}.part-${process.pid}-${Date.now()}`;

    try {
      console.log(`[Extensões] Baixando ${metadata.name} (${metadata.version})...`);
      const res = await axios({
        method: 'GET',
        url: metadata.apkUrl || apkUrl,
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: 150 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 OmniYomi-Desktop/1.1',
          'Accept': 'application/vnd.android.package-archive, application/octet-stream',
        },
      });

      const apkBuffer = Buffer.from(res.data);
      if (apkBuffer.length < 1024) throw new Error('O download retornou um arquivo muito pequeno para ser um APK válido.');
      const zip = new AdmZip(apkBuffer);
      // Multi-dex APKs may contain classes4.dex or later; retain every root DEX file.
      const dexEntries = zip.getEntries().filter((entry) =>
        /^classes(?:\d+)?\.dex$/i.test(entry.entryName)
      );
      const manifestEntry = zip.getEntry('AndroidManifest.xml');
      if (dexEntries.length === 0 || !manifestEntry) {
        throw new Error('O arquivo baixado não contém um AndroidManifest.xml e classes.dex válidos.');
      }

      fs.mkdirSync(stagingDir, { recursive: true });
      for (const entry of dexEntries) {
        zip.extractEntryTo(entry, stagingDir, false, true);
      }
      zip.extractEntryTo(manifestEntry, stagingDir, false, true);

      const name = metadata.name || pkg.split('.').pop() || pkg;
      const version = metadata.version || '1.0.0';
      const lang = metadata.lang || 'all';
      const sources = metadata.sources || [];
      const extensionManifest = {
        pkg,
        name,
        version,
        versionCode: metadata.versionCode || 0,
        extensionLib: metadata.extensionLib || '1.4',
        signingKey: metadata.signingKey || null,
        lang,
        hasDex: true,
        apkUrl: metadata.apkUrl || apkUrl,
        repoUrl: metadata.repoUrl || repoUrl,
        sources,
        extractedAt: Date.now(),
      };
      fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(extensionManifest, null, 2), 'utf8');
      fs.writeFileSync(tempApkPath, apkBuffer);

      const runtimeReady = await suwayomiService.ensureRunning();
      if (!runtimeReady) {
        throw new Error('Runtime Suwayomi não está instalado ou não iniciou. Execute o comando de preparação do OmniYomi e tente novamente.');
      }
      await suwayomiService.syncExtensionStores(
        db.getExtensionRepos().filter((entry: any) => entry.enabled).map((entry: any) => entry.url)
      );

      await suwayomiService.queryGql(`
        mutation UpdateExtension($id: String!, $install: Boolean!, $update: Boolean!) {
          updateExtension(input: {
            id: $id,
            patch: {
              install: $install,
              update: $update
            }
          }) {
            clientMutationId
          }
        }
      `, {
        id: pkg,
        install: !metadata.updateAvailable,
        update: Boolean(metadata.updateAvailable),
      });

      const installedData = await suwayomiService.queryGql(`
        query {
          extensions {
            nodes {
              pkgName
              isInstalled
              versionName
            }
          }
        }
      `);
      const serverExtension = (installedData?.extensions?.nodes || [])
        .find((entry: any) => entry.pkgName === pkg && entry.isInstalled);
      if (!serverExtension) {
        throw new Error('O runtime não confirmou a instalação da extensão. Ela não será marcada como instalada no OmniYomi.');
      }

      const backupDir = `${targetExtractDir}.backup-${Date.now()}`;
      const backupApk = `${apkPath}.backup-${Date.now()}`;
      let movedOldDir = false;
      let movedOldApk = false;
      try {
        if (fs.existsSync(targetExtractDir)) {
          fs.renameSync(targetExtractDir, backupDir);
          movedOldDir = true;
        }
        if (fs.existsSync(apkPath)) {
          fs.renameSync(apkPath, backupApk);
          movedOldApk = true;
        }
        fs.renameSync(stagingDir, targetExtractDir);
        fs.renameSync(tempApkPath, apkPath);
      } catch (error) {
        if (fs.existsSync(targetExtractDir)) fs.rmSync(targetExtractDir, { recursive: true, force: true });
        if (fs.existsSync(apkPath)) fs.rmSync(apkPath, { force: true });
        if (movedOldDir && fs.existsSync(backupDir)) fs.renameSync(backupDir, targetExtractDir);
        if (movedOldApk && fs.existsSync(backupApk)) fs.renameSync(backupApk, apkPath);
        throw error;
      }

      if (movedOldDir && fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
      if (movedOldApk && fs.existsSync(backupApk)) fs.rmSync(backupApk, { force: true });

      db.saveExtractedExtension({
        pkg,
        name,
        version,
        lang,
        apkUrl: metadata.apkUrl || apkUrl,
        iconUrl: metadata.iconUrl,
        extractedPath: targetExtractDir,
        sources,
      });
      extensionManager.registerApkExtensionSources({ pkg, name, version, lang, iconUrl: metadata.iconUrl, sources });
      this.cache.clear();

      console.log(`[Extensões] ${name} instalada e validada (${sources.length} fontes).`);
      return { ...extensionManifest, skipped: false, runtimeVersion: serverExtension.versionName };
    } catch (error) {
      if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
      if (fs.existsSync(tempApkPath)) fs.rmSync(tempApkPath, { force: true });
      throw error;
    }
  }

  public uninstallExtractedExtension(pkg: string): boolean {
    const targetDir = path.join(EXTRACTED_DIR, pkg);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    const apkPath = path.join(CACHE_DIR, `${pkg}.apk`);
    if (fs.existsSync(apkPath)) {
      fs.unlinkSync(apkPath);
    }

    // Desinstalar no Suwayomi também
    suwayomiService.isHealthy().then(healthy => {
      if (healthy) {
        suwayomiService.queryGql(`
          mutation {
            updateExtension(input: {
              id: "${pkg}",
              patch: { uninstall: true }
            }) {
              clientMutationId
            }
          }
        `).catch(() => {});
      }
    });

    // Remove from DB and ExtensionManager
    db.deleteExtractedExtension(pkg);
    extensionManager.removeApkExtensionSources(pkg);

    // Invalidate caches
    this.cache.clear();
    return true;
  }
}

export const repoManager = new RepoManager();
