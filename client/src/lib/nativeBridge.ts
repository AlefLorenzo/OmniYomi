import { registerPlugin } from '@capacitor/core';

export interface SourceConfiguration {
  [key: string]: string;
}

export interface ConfigurableSourceInfo {
  sourceId: string;
  name: string;
  isConfigurable: boolean;
  configuration?: SourceConfiguration;
  needsConfiguration?: boolean;
}

export interface NativeResponse<T> {
  error?: boolean;
  message?: string;
  [key: string]: any;
}

export interface TachiyomiNativePluginInterface {
  isAvailable(): Promise<{ available: boolean; platform: string }>;
  installExtension(options: { apkUrl: string; pkg: string }): Promise<{ success: boolean; pkg: string; sources: any[] }>;
  uninstallExtension(options: { pkg: string }): Promise<{ success: boolean }>;
  getInstalledSources(): Promise<{ sources: any[] }>;
  getPopularManga(options: { sourceId: string; page?: number }): Promise<NativeResponse<{ manga: any[]; hasNextPage: boolean }>>;
  getLatestManga(options: { sourceId: string; page?: number }): Promise<NativeResponse<{ manga: any[]; hasNextPage: boolean }>>;
  searchManga(options: { sourceId: string; query: string; page?: number }): Promise<NativeResponse<{ manga: any[]; hasNextPage: boolean }>>;
  getMangaDetails(options: { sourceId: string; mangaUrl: string }): Promise<NativeResponse<any>>;
  getChapterList(options: { sourceId: string; mangaUrl: string }): Promise<NativeResponse<{ chapters: any[] }>>;
  getPageList(options: { sourceId: string; chapterUrl: string }): Promise<NativeResponse<{ pages: any[]; totalPages: number }>>;
  downloadChapter(options: { sourceId: string; mangaId: string; chapterId: string; imageUrls: string[] }): Promise<NativeResponse<{ success: boolean }>>;
  getOfflinePages(options: { sourceId: string; mangaId: string; chapterId: string }): Promise<NativeResponse<{ isOffline: boolean; pages: any[]; totalPages: number }>>;
  downloadChapterFromSource(options: { sourceId: string; mangaId: string; chapterId: string }): Promise<NativeResponse<{ success: boolean }>>;
  getDownloadedChapters(): Promise<NativeResponse<{ downloads: any[] }>>;
  getStorageUsage(): Promise<NativeResponse<{ totalBytes: number; formatted: string }>>;
  deleteOfflineChapter(options: { chapterId: string }): Promise<NativeResponse<{ success: boolean }>>;
  deleteAllOfflineDownloads(): Promise<NativeResponse<{ success: boolean; deletedFolders: number }>>;

  // Configuração de fontes configuráveis
  getConfigurableSourceInfo(options: { sourceId: string }): Promise<NativeResponse<ConfigurableSourceInfo>>;
  saveSourceConfiguration(options: { sourceId: string; configuration: SourceConfiguration }): Promise<NativeResponse<{ success: boolean; message: string }>>;
  testSourceConnection(options: { sourceId: string }): Promise<NativeResponse<{ success: boolean; message: string; count?: number }>>;
}

export const TachiyomiNative = registerPlugin<TachiyomiNativePluginInterface>('TachiyomiNative');

let isNativeSupported: boolean | null = null;
let configurableSourcesCache: ConfigurableSourceInfo[] | null = null;

export async function checkIsNative(): Promise<boolean> {
  if (isNativeSupported !== null) return isNativeSupported;
  try {
    const res = await TachiyomiNative.isAvailable();
    isNativeSupported = Boolean(res?.available);
  } catch {
    isNativeSupported = false;
  }
  return isNativeSupported;
}

export async function getConfigurableSources(): Promise<ConfigurableSourceInfo[]> {
  if (configurableSourcesCache !== null) return configurableSourcesCache;
  try {
    const native = await checkIsNative();
    if (!native) return [];
    const res = await TachiyomiNative.getInstalledSources();
    const sources = res?.sources || [];
    const configurable: ConfigurableSourceInfo[] = [];
    for (const src of sources) {
      try {
        const info = await TachiyomiNative.getConfigurableSourceInfo({ sourceId: src.id });
        if (info.isConfigurable) {
          configurable.push(info);
        }
      } catch {}
    }
    configurableSourcesCache = configurable;
    return configurable;
  } catch {
    return [];
  }
}

export async function sourceNeedsConfiguration(sourceId: string): Promise<boolean> {
  const configurable = await getConfigurableSources();
  const source = configurable.find(s => s.sourceId === sourceId);
  return source?.needsConfiguration === true;
}

export function clearConfigurableSourcesCache(): void {
  configurableSourcesCache = null;
}
