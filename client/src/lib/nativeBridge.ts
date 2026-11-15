import { registerPlugin } from '@capacitor/core';

export interface TachiyomiNativePluginInterface {
  isAvailable(): Promise<{ available: boolean; platform: string }>;
  installExtension(options: { apkUrl: string; pkg: string }): Promise<{ success: boolean; pkg: string; sources: any[] }>;
  uninstallExtension(options: { pkg: string }): Promise<{ success: boolean }>;
  getInstalledSources(): Promise<{ sources: any[] }>;
  getPopularManga(options: { sourceId: string; page?: number }): Promise<{ manga: any[]; hasNextPage: boolean }>;
  getLatestManga(options: { sourceId: string; page?: number }): Promise<{ manga: any[]; hasNextPage: boolean }>;
  searchManga(options: { sourceId: string; query: string; page?: number }): Promise<{ manga: any[]; hasNextPage: boolean }>;
  getMangaDetails(options: { sourceId: string; mangaUrl: string }): Promise<any>;
  getChapterList(options: { sourceId: string; mangaUrl: string }): Promise<{ chapters: any[] }>;
  getPageList(options: { sourceId: string; chapterUrl: string }): Promise<{ pages: any[]; totalPages: number }>;
  downloadChapter(options: { sourceId: string; mangaId: string; chapterId: string; imageUrls: string[] }): Promise<{ success: boolean }>;
  getOfflinePages(options: { sourceId: string; mangaId: string; chapterId: string }): Promise<{ isOffline: boolean; pages: any[]; totalPages: number }>;
  getDownloadedChapters(): Promise<{ downloads: any[] }>;
  getStorageUsage(): Promise<{ totalBytes: number; formatted: string }>;
  deleteOfflineChapter(options: { chapterId: string }): Promise<{ success: boolean }>;
  deleteAllOfflineDownloads(): Promise<{ success: boolean; deletedFolders: number }>;
}

export const TachiyomiNative = registerPlugin<TachiyomiNativePluginInterface>('TachiyomiNative');

let isNativeSupported: boolean | null = null;

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
