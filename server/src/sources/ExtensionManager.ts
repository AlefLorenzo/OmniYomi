import fs from 'fs';
import path from 'path';
import vm from 'vm';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import { ISource, BaseSource } from './BaseSource.js';
import { MangaDexSource } from './MangaDexSource.js';
import { LocalStorageSource } from './LocalStorageSource.js';
import { ApkSourceAdapter } from './ApkSourceAdapter.js';
import { SourceManifest, ExtensionRepoItem, MangaListResult, Chapter, PageImage, Manga } from '../types/index.js';
import { db } from '../db/database.js';
import { suwayomiService } from '../services/SuwayomiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSIONS_DIR = path.resolve(__dirname, '../../../data/extensions');

if (!fs.existsSync(EXTENSIONS_DIR)) {
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });
}

export class ExtensionManager {
  private sources: Map<string, ISource> = new Map();
  private sourceHealth: Map<string, { status: 'OK' | 'ERROR'; lastChecked: number; error?: string }> = new Map();

  constructor() {
    this.registerBuiltInSources();
    this.loadExternalExtensions();
    this.loadExtractedApkExtensions();
  }

  private registerBuiltInSources() {
    const mangadex = new MangaDexSource();
    const local = new LocalStorageSource();

    this.registerSource(mangadex);
    this.registerSource(local);
  }

  public loadExtractedApkExtensions() {
    try {
      const extractedList = db.getExtractedExtensions();
      for (const ext of extractedList) {
        for (const s of ext.sources || []) {
          const adapter = new ApkSourceAdapter({
            pkg: ext.pkg,
            sourceId: String(s.id),
            name: s.name || ext.name,
            version: ext.version,
            lang: s.lang || ext.lang || 'all',
            iconUrl: ext.iconUrl,
            baseUrl: s.baseUrl,
          });
          this.sources.set(adapter.id, adapter);
          db.registerSource(adapter.getManifest());
          console.log(`[Extensões APK] Fonte carregada: ${adapter.name} (${adapter.id})`);
        }
      }
    } catch (e: any) {
      console.warn('Erro ao carregar fontes APK extraídas:', e.message);
    }
  }

  public registerApkExtensionSources(ext: {
    pkg: string;
    name: string;
    version: string;
    lang: string;
    iconUrl?: string;
    sources: any[];
  }) {
    for (const s of ext.sources || []) {
      const adapter = new ApkSourceAdapter({
        pkg: ext.pkg,
        sourceId: String(s.id),
        name: s.name || ext.name,
        version: ext.version,
        lang: s.lang || ext.lang || 'all',
        iconUrl: ext.iconUrl,
        baseUrl: s.baseUrl,
      });
      this.sources.set(adapter.id, adapter);
      db.registerSource(adapter.getManifest());
      console.log(`[Extensões APK] Nova fonte registrada em tempo real: ${adapter.name} (${adapter.id})`);
    }
  }

  public removeApkExtensionSources(pkg: string) {
    const prefix = `apk:${pkg}:`;
    for (const id of Array.from(this.sources.keys())) {
      if (id.startsWith(prefix)) {
        this.sources.delete(id);
        this.sourceHealth.delete(id);
      }
    }
  }

  public registerSource(source: ISource) {
    this.sources.set(source.id, source);
    db.registerSource(source.getManifest());
  }

  public getSource(id: string): ISource | undefined {
    return this.sources.get(id);
  }

  public getAllSources(): (SourceManifest & { health: { status: 'OK' | 'ERROR'; lastChecked: number; error?: string } })[] {
    const dbSources = db.getSources();
    const result: (SourceManifest & { health: { status: 'OK' | 'ERROR'; lastChecked: number; error?: string } })[] = [];
    const seenIds = new Set<string>();

    for (const s of dbSources) {
      seenIds.add(s.id);
      const liveSource = this.sources.get(s.id);
      const manifest = liveSource ? liveSource.getManifest() : s;
      const health = this.sourceHealth.get(s.id) || { status: 'OK', lastChecked: Date.now() };

      result.push({
        ...manifest,
        isEnabled: s.isEnabled,
        health,
      });
    }

    // Incluir fontes ativas em memória que ainda não foram persistidas
    for (const [id, liveSource] of this.sources.entries()) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const manifest = liveSource.getManifest();
        const health = this.sourceHealth.get(id) || { status: 'OK', lastChecked: Date.now() };
        result.push({
          ...manifest,
          isEnabled: true,
          health,
        });
      }
    }

    return result;
  }

  public async syncSuwayomiExtensions(): Promise<void> {
    try {
      const isRunning = await suwayomiService.ensureRunning();
      if (!isRunning) return;

      // 1. Obter extensões instaladas no Suwayomi
      const suwExtData = await suwayomiService.queryGql(`
        query {
          extensions {
            nodes {
              pkgName
              name
              lang
              versionName
              isInstalled
            }
          }
        }
      `);

      const installedInSuwayomi = new Set<string>(
        (suwExtData?.extensions?.nodes || [])
          .filter((n: any) => n.isInstalled)
          .map((n: any) => n.pkgName)
      );

      // 2. Garantir que todas as extensões do banco local estejam instaladas no Suwayomi
      const extractedList = db.getExtractedExtensions();
      for (const ext of extractedList) {
        if (!installedInSuwayomi.has(ext.pkg)) {
          console.log(`[ExtensionManager] Sincronizando e instalando extensão no Suwayomi: ${ext.name} (${ext.pkg})...`);
          try {
            await suwayomiService.queryGql(`
              mutation {
                updateExtension(input: {
                  id: "${ext.pkg}",
                  patch: { install: true }
                }) {
                  clientMutationId
                }
              }
            `);
            installedInSuwayomi.add(ext.pkg);
          } catch (e: any) {
            console.warn(`[ExtensionManager] Falha ao sincronizar ${ext.pkg} no Suwayomi:`, e.message);
          }
        }
      }

      // 3. Obter todas as fontes ativas no Suwayomi e registrá-las no OmniYomi
      const suwSourcesData = await suwayomiService.queryGql(`
        query {
          sources {
            nodes {
              id
              name
              lang
              isNsfw
            }
          }
        }
      `);

      const suwSources = suwSourcesData?.sources?.nodes || [];
      for (const s of suwSources) {
        if (s.id === '0') continue; // Ignorar Local source do Suwayomi

        // Encontrar extensão correspondente se disponível
        const matchedExt = extractedList.find(e => (e.sources || []).some((src: any) => String(src.id) === String(s.id)));
        const pkg = matchedExt ? matchedExt.pkg : 'tachiyomi';
        const iconUrl = matchedExt?.iconUrl || '/assets/apk-icon.png';
        const version = matchedExt?.version || '1.0.0';

        const adapterId = `apk:${pkg}:${s.id}`;
        if (!this.sources.has(adapterId)) {
          const adapter = new ApkSourceAdapter({
            pkg,
            sourceId: String(s.id),
            name: s.name,
            version,
            lang: s.lang || 'all',
            iconUrl,
            isNsfw: Boolean(s.isNsfw),
          });
          this.sources.set(adapter.id, adapter);
          db.registerSource(adapter.getManifest());
          console.log(`[ExtensionManager] Fonte Suwayomi sincronizada e registrada: ${s.name} (${adapter.id})`);
        }
      }
    } catch (err: any) {
      console.warn('[ExtensionManager] Aviso ao sincronizar com Suwayomi:', err.message);
    }
  }

  public toggleSource(id: string, isEnabled: boolean) {
    db.toggleSource(id, isEnabled);
  }

  public async checkSourceHealth(id: string): Promise<{ status: 'OK' | 'ERROR'; message: string }> {
    const source = this.sources.get(id);
    if (!source) {
      return { status: 'ERROR', message: 'Fonte não encontrada no servidor' };
    }

    try {
      const res = await source.getPopular(1);
      if (res && Array.isArray(res.manga)) {
        this.sourceHealth.set(id, { status: 'OK', lastChecked: Date.now() });
        return { status: 'OK', message: `Conexão bem-sucedida! ${res.manga.length} obras encontradas no catálogo.` };
      } else {
        throw new Error('Resposta inválida da fonte');
      }
    } catch (err: any) {
      const msg = err.message || 'Falha ao conectar com a fonte';
      this.sourceHealth.set(id, { status: 'ERROR', lastChecked: Date.now(), error: msg });
      return { status: 'ERROR', message: msg };
    }
  }

  // Load external .js extensions dynamically from data/extensions/
  public loadExternalExtensions() {
    if (!fs.existsSync(EXTENSIONS_DIR)) return;

    const files = fs.readdirSync(EXTENSIONS_DIR);
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const filePath = path.join(EXTENSIONS_DIR, file);
          const code = fs.readFileSync(filePath, 'utf-8');
          this.executeAndRegisterExtension(code, file);
        } catch (err: any) {
          console.error(`Falha ao carregar extensão ${file}:`, err.message);
        }
      }
    }
  }

  public executeAndRegisterExtension(code: string, fileName: string) {
    const sandbox: any = {
      console,
      axios,
      cheerio,
      fetch: globalThis.fetch,
      BaseSource,
      exports: {},
      module: { exports: {} },
    };

    const context = vm.createContext(sandbox);
    const script = new vm.Script(code, { filename: fileName });
    script.runInContext(context);

    const ExportedClass = sandbox.module.exports || sandbox.exports;
    if (typeof ExportedClass === 'function') {
      const instance = new ExportedClass();
      if (instance.id && instance.name && typeof instance.getPopular === 'function') {
        this.registerSource(instance);
        console.log(`[Extensões] Fonte externa registrada com sucesso: ${instance.name} (${instance.id})`);
        return instance;
      }
    }
    throw new Error('Extensão deve exportar uma classe que implemente ISource');
  }

  // List extensions available in repository
  public async getAvailableExtensions(): Promise<ExtensionRepoItem[]> {
    // Official & Community verified repository extensions list
    const catalog: ExtensionRepoItem[] = [
      {
        id: 'mangadex',
        name: 'MangaDex (Oficial)',
        version: '1.0.0',
        lang: 'all',
        description: 'Catálogo global de mangás, manhwas e manhuas em múltiplos idiomas com API oficial v5.',
        iconUrl: 'https://mangadex.org/favicon.ico',
        author: 'MangaDex Community',
        sourceUrl: 'builtin',
        isInstalled: true,
        installedVersion: '1.0.0',
        updateAvailable: false,
      },
      {
        id: 'local',
        name: 'Armazenamento Local',
        version: '1.0.0',
        lang: 'pt-br',
        description: 'Leitor e indexador offline para arquivos CBZ, ZIP e pastas com imagens no computador.',
        iconUrl: '/assets/local-source.png',
        author: 'OmniYomi Core',
        sourceUrl: 'builtin',
        isInstalled: true,
        installedVersion: '1.0.0',
        updateAvailable: false,
      },
      {
        id: 'weebcentral',
        name: 'WeebCentral',
        version: '1.0.2',
        lang: 'en',
        description: 'Grande agregador em inglês com foco em lançamentos rápidos de mangás e manhwas populares.',
        iconUrl: 'https://weebcentral.com/favicon.ico',
        author: 'Keiyoushi Port',
        sourceUrl: 'https://raw.githubusercontent.com/apkmanhwa/extensions/main/weebcentral.js',
        isInstalled: this.sources.has('weebcentral'),
        installedVersion: this.sources.get('weebcentral')?.version,
        updateAvailable: false,
      },
    ];

    return catalog;
  }

  public installExtensionFromCode(id: string, code: string) {
    const fileName = `${id}.js`;
    const filePath = path.join(EXTENSIONS_DIR, fileName);
    fs.writeFileSync(filePath, code, 'utf-8');
    return this.executeAndRegisterExtension(code, fileName);
  }

  public uninstallExtension(id: string): boolean {
    if (id === 'mangadex' || id === 'local') {
      throw new Error('Fontes do sistema não podem ser desinstaladas. Você pode desativá-las.');
    }

    const fileName = `${id}.js`;
    const filePath = path.join(EXTENSIONS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    this.sources.delete(id);
    this.sourceHealth.delete(id);
    db.toggleSource(id, false);
    return true;
  }
}

export const extensionManager = new ExtensionManager();
