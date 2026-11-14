import axios from 'axios';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
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
    const cached = this.cache.get(repoUrl);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.extensions;
    }

    try {
      const res = await axios.get(repoUrl, {
        headers: {
          'User-Agent': 'OmniYomi-Tachiyomi-Extension-Extractor/1.0',
          'Accept': 'application/json',
        },
        timeout: 20000,
      });

      const data = res.data;
      const extensions: RepoExtension[] = [];
      const extractedList = db.getExtractedExtensions();
      const extractedPkgs = new Set(extractedList.map((e: any) => e.pkg));

      // Derive base URL for relative assets
      const urlObj = new URL(repoUrl);
      const basePath = repoUrl.substring(0, repoUrl.lastIndexOf('/'));

      // Case A: Legacy format (index.min.json - Array of objects)
      if (Array.isArray(data)) {
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
            isNsfw: item.nsfw === 1 || item.contentWarning?.includes('NSFW'),
            repoUrl,
            repoName: urlObj.hostname,
            sources,
            isInstalled: extractedPkgs.has(pkg),
            isExtracted: extractedPkgs.has(pkg),
          });
        }
      }
      // Case B: Modern format (index.json with extensionList)
      else if (data && typeof data === 'object') {
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
            isNsfw: item.contentWarning?.includes('NSFW') || false,
            repoUrl,
            repoName,
            sources,
            isInstalled: extractedPkgs.has(pkg),
            isExtracted: extractedPkgs.has(pkg),
          });
        }
      }

      this.cache.set(repoUrl, { extensions, timestamp: Date.now() });
      db.updateRepoSynced(repoUrl);
      return extensions;
    } catch (err: any) {
      console.error(`Erro ao carregar repositório de extensões ${repoUrl}:`, err.message);
      throw new Error(`Falha ao carregar repositório: ${err.message}`);
    }
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

    let filtered = allExtensions;

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
