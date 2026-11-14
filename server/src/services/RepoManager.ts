import axios from 'axios';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
import { decodeProtobufRepo } from './ProtobufRepoDecoder.js';
import { RepoExtension, RepoExtensionSource } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSIONS_DIR = path.resolve(__dirname, '../../../data/extensions');
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
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.extensions;
    }

    const extractedList = db.getExtractedExtensions();
    const extractedPkgs = new Set(extractedList.map((e: any) => e.pkg));

    // Try fetching with smart format fallback (.pb, index.json, index.min.json)
    const candidateUrls = this.resolveCandidateUrls(cleanUrl);
    let lastError: any = null;

    for (const url of candidateUrls) {
      try {
        let extensions: RepoExtension[] = [];

        if (url.endsWith('.pb')) {
          // Protocol Buffer binary format
          const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 25000,
            headers: { 'User-Agent': 'OmniYomi-Tachiyomi-Extension-Extractor/1.0' },
          });

          const buffer = Buffer.from(res.data);
          extensions = decodeProtobufRepo(buffer, url);
        } else {
          // JSON format (index.min.json or index.json)
          const res = await axios.get(url, {
            timeout: 25000,
            headers: {
              'User-Agent': 'OmniYomi-Tachiyomi-Extension-Extractor/1.0',
              'Accept': 'application/json',
            },
          });

          const data = res.data;
          const urlObj = new URL(url);
          const basePath = url.substring(0, url.lastIndexOf('/'));

          // Check if index.min.json returned an "outdated / update to mihon" stub
          if (Array.isArray(data) && data.length <= 2 && data.some(d => d.name?.includes('Mihon') || d.name?.includes('Outdated'))) {
            // Try fetching index.json in the same folder instead
            const indexJsonUrl = `${basePath}/index.json`;
            try {
              const fullRes = await axios.get(indexJsonUrl, { timeout: 25000 });
              if (fullRes.data?.extensionList?.extensions?.length > 10) {
                return this.parseModernJson(fullRes.data, indexJsonUrl, extractedPkgs);
              }
            } catch {
              // continue
            }
          }

          if (Array.isArray(data)) {
            extensions = this.parseLegacyJson(data, url, basePath, urlObj.hostname, extractedPkgs);
          } else if (data && typeof data === 'object') {
            extensions = this.parseModernJson(data, url, extractedPkgs);
          }
        }

        if (extensions.length > 0) {
          // Cross-reference extracted state
          for (const ext of extensions) {
            ext.isExtracted = extractedPkgs.has(ext.pkg);
            ext.isInstalled = extractedPkgs.has(ext.pkg);
          }

          this.cache.set(cleanUrl, { extensions, timestamp: Date.now() });
          db.updateRepoSynced(cleanUrl);
          return extensions;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    throw new Error(`Falha ao extrair extensões de ${cleanUrl}: ${lastError?.message || 'Nenhuma extensão encontrada'}`);
  }

  private resolveCandidateUrls(url: string): string[] {
    const urls = [url];
    if (url.endsWith('/')) {
      urls.push(`${url}index.json`, `${url}index.min.json`, `${url}index.pb`);
    } else if (url.endsWith('index.min.json')) {
      urls.push(url.replace('index.min.json', 'index.json'), url.replace('index.min.json', 'index.pb'));
    } else if (url.endsWith('index.pb')) {
      urls.push(url.replace('index.pb', 'index.json'), url.replace('index.pb', 'index.min.json'));
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
        version: item.version || item.versionName || '1.0.0',
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
        lang: sources[0]?.lang || 'all',
        iconUrl,
        apkUrl,
        isNsfw: Boolean(item.contentWarning?.includes('NSFW')),
        repoUrl: url,
        repoName,
        sources,
        isInstalled: extractedPkgs.has(pkg),
        isExtracted: extractedPkgs.has(pkg),
      });
    }

    return extensions;
  }

  public async getAllExtensions(query?: string, lang?: string): Promise<RepoExtension[]> {
    const repos = db.getExtensionRepos().filter((r: any) => r.enabled);
    const allExtensions: RepoExtension[] = [];

    for (const repo of repos) {
      try {
        const list = await this.fetchRepoExtensions(repo.url);
        allExtensions.push(...list);
      } catch (e: any) {
        console.warn(`Repositório ${repo.name} ignorado na sincronização:`, e.message);
      }
    }

    // Deduplicate by package name
    const uniqueMap = new Map<string, RepoExtension>();
    for (const ext of allExtensions) {
      if (!uniqueMap.has(ext.pkg)) {
        uniqueMap.set(ext.pkg, ext);
      }
    }

    let filtered = Array.from(uniqueMap.values());

    if (lang && lang !== 'all') {
      const l = lang.toLowerCase();
      filtered = filtered.filter(e =>
        e.lang.toLowerCase() === l ||
        e.sources.some(s => s.lang.toLowerCase() === l)
      );
    }

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.pkg.toLowerCase().includes(q) ||
        e.sources.some(s => s.name.toLowerCase().includes(q))
      );
    }

    return filtered;
  }

  // Downloads APK, extracts dex, icons, manifest and saves extracted extension
  public async extractApkExtension(pkg: string, apkUrl: string, repoUrl: string): Promise<any> {
    if (!apkUrl) {
      throw new Error('URL do arquivo APK não fornecida.');
    }

    const apkPath = path.join(CACHE_DIR, `${pkg}.apk`);
    const targetExtractDir = path.join(EXTRACTED_DIR, pkg);

    // 1. Download APK
    console.log(`[Extrator] Baixando APK da extensão: ${pkg} de ${apkUrl}...`);
    const res = await axios({
      method: 'GET',
      url: apkUrl,
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android; Mobile) OmniYomi/1.0',
      },
    });

    fs.writeFileSync(apkPath, Buffer.from(res.data));

    // 2. Unpack APK with AdmZip
    console.log(`[Extrator] Descompactando APK: ${pkg}...`);
    const zip = new AdmZip(apkPath);
    if (!fs.existsSync(targetExtractDir)) {
      fs.mkdirSync(targetExtractDir, { recursive: true });
    }

    // Extract classes.dex and AndroidManifest.xml
    const entries = zip.getEntries();
    let hasDex = false;
    let iconPath: string | null = null;

    for (const entry of entries) {
      if (entry.entryName === 'classes.dex') {
        zip.extractEntryTo(entry, targetExtractDir, false, true);
        hasDex = true;
      } else if (entry.entryName === 'AndroidManifest.xml') {
        zip.extractEntryTo(entry, targetExtractDir, false, true);
      } else if (entry.entryName.startsWith('res/') && entry.entryName.endsWith('.png') && !iconPath) {
        // Extract icon
        zip.extractEntryTo(entry, targetExtractDir, false, true);
        iconPath = path.join(targetExtractDir, path.basename(entry.entryName));
      }
    }

    // 3. Find extension metadata from cached repos
    const allRepoExts = await this.getAllExtensions();
    const meta = allRepoExts.find(e => e.pkg === pkg);

    const name = meta?.name || pkg.split('.').pop() || pkg;
    const version = meta?.version || '1.0.0';
    const lang = meta?.lang || 'all';
    const sources = meta?.sources || [];

    // Save manifest.json in extracted folder
    const extensionManifest = {
      pkg,
      name,
      version,
      lang,
      hasDex,
      apkUrl,
      repoUrl,
      sources,
      extractedAt: Date.now(),
    };

    fs.writeFileSync(
      path.join(targetExtractDir, 'manifest.json'),
      JSON.stringify(extensionManifest, null, 2),
      'utf-8'
    );

    // 4. Save to database
    db.saveExtractedExtension({
      pkg,
      name,
      version,
      lang,
      apkUrl,
      iconUrl: meta?.iconUrl,
      extractedPath: targetExtractDir,
      sources,
    });

    // 5. Register live sources into ExtensionManager so they are immediately browsable
    extensionManager.registerApkExtensionSources({
      pkg,
      name,
      version,
      lang,
      iconUrl: meta?.iconUrl,
      sources,
    });

    // Invalidate memory cache so UI sees it as installed
    this.cache.delete(repoUrl);

    console.log(`[Extrator] Extensão extraída e instalada com sucesso: ${name} (${sources.length} fontes)`);
    return extensionManifest;
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

    // Remove from DB and ExtensionManager
    db.deleteExtractedExtension(pkg);
    extensionManager.removeApkExtensionSources(pkg);

    // Invalidate caches
    this.cache.clear();
    return true;
  }
}

export const repoManager = new RepoManager();
