export type PublicationStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'CANCELLED' | 'UNKNOWN';

export interface Manga {
  id: string; // usually `${sourceId}:${sourceMangaId}`
  sourceId: string;
  sourceName?: string;
  sourceMangaId: string;
  title: string;              // Obrigatório em PT-BR ou EN
  titleLang?: 'pt-br' | 'en' | 'unknown'; // Idioma identificado do título
  originalTitle?: string;     // Título original (em japonês, coreano, romaji, etc.)
  altTitles: string[];
  metadataSource?: string;    // Fonte do metadado
  description: string;
  author: string;
  artist: string;
  genres: string[];
  status: PublicationStatus;
  coverUrl: string;
  inLibrary: boolean;
  isFavorite?: boolean;
  categoryId: string | null;
  totalChapters: number;
  unreadCount: number;
  downloadedCount: number;
  lastChapterNumber: number;
  lastReadChapterId: string | null;
  lastReadAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string; // `${sourceId}:${sourceMangaId}:${sourceChapterId}`
  mangaId: string;
  sourceId: string;
  sourceChapterId: string;
  title: string;
  chapterNumber: number;
  volume: number | null;
  releaseDate: string | null;
  scanlator: string | null;
  url: string | null;
  isRead: boolean;
  lastPageRead: number;
  totalPages: number;
  isDownloaded: boolean;
  downloadProgress: number;
  downloadedPath: string | null;
}

export interface PageImage {
  index: number;
  url: string;
  localPath?: string;
  headers?: Record<string, string>;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export type DownloadStatus = 'PENDING' | 'DOWNLOADING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface DownloadItem {
  id: string;
  chapterId: string;
  mangaId: string;
  sourceId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  coverUrl: string;
  status: DownloadStatus;
  progress: number;
  totalPages: number;
  downloadedPages: number;
  error?: string | null;
  createdAt: number;
  completedAt?: number | null;
}

export interface ReadingHistoryItem {
  id: string;
  mangaId: string;
  sourceId?: string;
  chapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  coverUrl: string;
  page: number;
  totalPages: number;
  readAt: number;
}

export interface AppSettings {
  downloadPath: string;
  concurrentDownloads: number;
  autoUpdateIntervalMinutes: number;
  defaultReaderMode: 'paged_rtl' | 'paged_ltr' | 'vertical_webtoon';
  defaultFitMode: 'fit_width' | 'fit_height' | 'fit_screen' | 'original';
  pageSpacing: number;
  autoMarkReadPercent: number;
  port: number;
  flaresolverrUrl?: string;
  flaresolverrEnabled?: boolean;
}

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterDefinition {
  id: string;
  name: string;
  type: 'select' | 'multiselect' | 'text' | 'checkbox';
  options?: FilterOption[];
  defaultValue?: any;
}

export interface SourceManifest {
  id: string;
  name: string;
  version: string;
  lang: string;
  iconUrl: string;
  baseUrl: string;
  isEnabled: boolean;
  isNsfw: boolean;
  hasPopular: boolean;
  hasLatest: boolean;
  supportsSearch: boolean;
  filters?: FilterDefinition[];
}

export interface MangaListResult {
  manga: Manga[];
  hasNextPage: boolean;
  page: number;
  total?: number;
}

export interface ExtensionRepo {
  url: string;
  name: string;
  enabled: boolean;
  lastSynced: number | null;
  extensionCount?: number;
}

export interface RepoExtensionSource {
  id: string;
  name: string;
  lang: string;
  baseUrl?: string;
}

export interface RepoExtension {
  id: string;
  pkg: string;
  name: string;
  version: string;
  lang: string;
  iconUrl: string;
  apkUrl: string;
  isNsfw: boolean;
  repoUrl: string;
  repoName: string;
  sources: RepoExtensionSource[];
  isInstalled: boolean;
  isExtracted: boolean;
  extractedPath?: string | null;
}

export interface ExtensionRepoItem {
  id: string;
  name: string;
  version: string;
  lang: string;
  description: string;
  iconUrl: string;
  author: string;
  sourceUrl: string;
  isInstalled: boolean;
  installedVersion?: string;
  updateAvailable?: boolean;
}
