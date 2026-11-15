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

// Tipos de resposta nativa (formato real retornado pelo plugin Java)
export interface NativeSourceResponse {
  manga?: any[];
  hasNextPage?: boolean;
  chapters?: any[];
  pages?: any[];
  totalPages?: number;
  isOffline?: boolean;
  downloads?: any[];
  totalBytes?: number;
  formatted?: string;
  success?: boolean;
  message?: string;
  count?: number;
  error?: boolean;
  sourceId?: string;
  name?: string;
  isConfigurable?: boolean;
  configuration?: SourceConfiguration;
  needsConfiguration?: boolean;
  isNative?: boolean;
  pkg?: string;
  sources?: any[];
  isInstalled?: boolean;
  isEnabled?: boolean;
  hasPopular?: boolean;
  hasLatest?: boolean;
  supportsSearch?: boolean;
  lang?: string;
  version?: string;
  iconUrl?: string;
  baseUrl?: string;
  id?: string;
  nativeSourceId?: string;
  nativeSource?: string;
  title?: string;
  coverUrl?: string;
  author?: string;
  artist?: string;
  description?: string;
  status?: string;
  sourceMangaId?: string;
  inLibrary?: boolean;
  isFavorite?: boolean;
  categoryId?: string;
  savedAt?: string;
  wasInLibraryBeforeFavorite?: boolean;
}

export interface TachiyomiNativePluginInterface {
  isAvailable(): Promise<{ available: boolean; platform: string }>;
  installExtension(options: { apkUrl: string; pkg: string }): Promise<{ success: boolean; pkg: string; sources: any[] }>;
  uninstallExtension(options: { pkg: string }): Promise<{ success: boolean }>;
  getInstalledSources(): Promise<{ sources: any[] }>;
  getPopularManga(options: { sourceId: string; page?: number }): Promise<NativeSourceResponse>;
  getLatestManga(options: { sourceId: string; page?: number }): Promise<NativeSourceResponse>;
  searchManga(options: { sourceId: string; query: string; page?: number }): Promise<NativeSourceResponse>;
  getMangaDetails(options: { sourceId: string; mangaUrl: string }): Promise<NativeSourceResponse>;
  getChapterList(options: { sourceId: string; mangaUrl: string }): Promise<NativeSourceResponse>;
  getPageList(options: { sourceId: string; chapterUrl: string }): Promise<NativeSourceResponse>;
  downloadChapter(options: { sourceId: string; mangaId: string; chapterId: string; imageUrls: string[] }): Promise<NativeSourceResponse>;
  getOfflinePages(options: { sourceId: string; mangaId: string; chapterId: string }): Promise<NativeSourceResponse>;
  downloadChapterFromSource(options: { sourceId: string; mangaId: string; chapterId: string }): Promise<NativeSourceResponse>;
  getDownloadedChapters(): Promise<NativeSourceResponse>;
  getStorageUsage(): Promise<NativeSourceResponse>;
  deleteOfflineChapter(options: { chapterId: string }): Promise<NativeSourceResponse>;
  deleteAllOfflineDownloads(): Promise<NativeSourceResponse>;

  // Configuração de fontes configuráveis
  getConfigurableSourceInfo(options: { sourceId: string }): Promise<NativeSourceResponse>;
  saveSourceConfiguration(options: { sourceId: string; configuration: SourceConfiguration }): Promise<NativeSourceResponse>;
  testSourceConnection(options: { sourceId: string }): Promise<NativeSourceResponse>;
}

export const TachiyomiNative = registerPlugin<TachiyomiNativePluginInterface>('TachiyomiNative');

let isNativeSupported: boolean | null = null;
let configurableSourcesCache: ConfigurableSourceInfo[] | null = null;

// Helper para lidar com respostas nativas de forma consistente
function unwrapNativeResponse<T>(res: NativeSourceResponse): T {
  if (res?.error) {
    throw new Error(res.message || 'Erro na operação nativa');
  }
  return res as T;
}

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
        // O plugin retorna NativeSourceResponse, precisamos extrair os campos
        if (info.isConfigurable) {
          configurable.push({
            sourceId: info.sourceId || src.id,
            name: info.name || src.name,
            isConfigurable: info.isConfigurable,
            configuration: info.configuration,
            needsConfiguration: info.needsConfiguration,
          });
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
