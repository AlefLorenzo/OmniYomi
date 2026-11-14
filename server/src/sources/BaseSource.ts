import { Manga, Chapter, PageImage, FilterDefinition, MangaListResult, SourceManifest } from '../types/index.js';

export interface ISource {
  id: string;
  name: string;
  version: string;
  lang: string;
  iconUrl: string;
  baseUrl: string;
  isNsfw: boolean;
  filters?: FilterDefinition[];

  getManifest(): SourceManifest;
  getPopular(page: number): Promise<MangaListResult>;
  getLatest(page: number): Promise<MangaListResult>;
  search(query: string, page: number, filters?: Record<string, any>): Promise<MangaListResult>;
  getMangaDetails(sourceMangaId: string): Promise<Partial<Manga>>;
  getChapterList(sourceMangaId: string): Promise<Chapter[]>;
  getPageList(sourceChapterId: string, chapterUrl?: string): Promise<PageImage[]>;
}

export abstract class BaseSource implements ISource {
  abstract id: string;
  abstract name: string;
  abstract version: string;
  abstract lang: string;
  abstract iconUrl: string;
  abstract baseUrl: string;
  isNsfw: boolean = false;
  filters?: FilterDefinition[] = [];

  getManifest(): SourceManifest {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      lang: this.lang,
      iconUrl: this.iconUrl,
      baseUrl: this.baseUrl,
      isEnabled: true,
      isNsfw: this.isNsfw,
      hasPopular: true,
      hasLatest: true,
      supportsSearch: true,
      filters: this.filters,
    };
  }

  abstract getPopular(page: number): Promise<MangaListResult>;
  abstract getLatest(page: number): Promise<MangaListResult>;
  abstract search(query: string, page: number, filters?: Record<string, any>): Promise<MangaListResult>;
  abstract getMangaDetails(sourceMangaId: string): Promise<Partial<Manga>>;
  abstract getChapterList(sourceMangaId: string): Promise<Chapter[]>;
  abstract getPageList(sourceChapterId: string, chapterUrl?: string): Promise<PageImage[]>;
}
