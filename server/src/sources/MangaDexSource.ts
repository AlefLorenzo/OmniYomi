import axios from 'axios';
import { BaseSource } from './BaseSource.js';
import { Manga, Chapter, PageImage, MangaListResult, FilterDefinition } from '../types/index.js';

export class MangaDexSource extends BaseSource {
  id = 'mangadex';
  name = 'MangaDex';
  version = '1.0.0';
  lang = 'all';
  iconUrl = 'https://mangadex.org/favicon.ico';
  baseUrl = 'https://api.mangadex.org';
  isNsfw = false;

  private client = axios.create({
    baseURL: 'https://api.mangadex.org',
    timeout: 15000,
    headers: {
      'User-Agent': 'OmniYomi-Reader/1.0.0 (https://github.com/apkmanhwa/omniyomi)',
    },
  });

  filters: FilterDefinition[] = [
    {
      id: 'translatedLanguage',
      name: 'Idioma dos Capítulos',
      type: 'select',
      options: [
        { label: 'Todos', value: '' },
        { label: 'Inglês (EN)', value: 'en' },
        { label: 'Português Brasileiro (PT-BR)', value: 'pt-br' },
        { label: 'Espanhol (ES)', value: 'es' },
      ],
      defaultValue: 'en',
    },
    {
      id: 'publicationDemographic',
      name: 'Demografia',
      type: 'select',
      options: [
        { label: 'Todas', value: '' },
        { label: 'Shounen', value: 'shounen' },
        { label: 'Seinen', value: 'seinen' },
        { label: 'Shoujo', value: 'shoujo' },
        { label: 'Josei', value: 'josei' },
      ],
      defaultValue: '',
    },
  ];

  async getPopular(page: number = 1): Promise<MangaListResult> {
    const limit = 24;
    const offset = (page - 1) * limit;

    const res = await this.client.get('/manga', {
      params: {
        limit,
        offset,
        'order[followedCount]': 'desc',
        'includes[]': ['cover_art', 'author', 'artist'],
        'contentRating[]': ['safe', 'suggestive'],
      },
    });

    const items = res.data.data.map((item: any) => this.mapManga(item));
    return {
      manga: items,
      hasNextPage: offset + limit < res.data.total,
      page,
      total: res.data.total,
    };
  }

  async getLatest(page: number = 1): Promise<MangaListResult> {
    const limit = 24;
    const offset = (page - 1) * limit;

    const res = await this.client.get('/manga', {
      params: {
        limit,
        offset,
        'order[latestUploadedChapter]': 'desc',
        'includes[]': ['cover_art', 'author', 'artist'],
        'contentRating[]': ['safe', 'suggestive'],
      },
    });

    const items = res.data.data.map((item: any) => this.mapManga(item));
    return {
      manga: items,
      hasNextPage: offset + limit < res.data.total,
      page,
      total: res.data.total,
    };
  }

  async search(query: string, page: number = 1, filters?: Record<string, any>): Promise<MangaListResult> {
    const limit = 24;
    const offset = (page - 1) * limit;

    const params: any = {
      limit,
      offset,
      'includes[]': ['cover_art', 'author', 'artist'],
      'contentRating[]': ['safe', 'suggestive', 'erotica'],
    };

    if (query && query.trim()) {
      params.title = query.trim();
    }

    if (filters?.publicationDemographic) {
      params['publicationDemographic[]'] = [filters.publicationDemographic];
    }

    const res = await this.client.get('/manga', { params });
    const items = res.data.data.map((item: any) => this.mapManga(item));
    return {
      manga: items,
      hasNextPage: offset + limit < res.data.total,
      page,
      total: res.data.total,
    };
  }

  async getMangaDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    const res = await this.client.get(`/manga/${sourceMangaId}`, {
      params: {
        'includes[]': ['cover_art', 'author', 'artist'],
      },
    });

    return this.mapManga(res.data.data);
  }

  async getChapterList(sourceMangaId: string, preferredLang: string = 'en'): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    const limit = 500;
    let offset = 0;
    let total = 1;

    // Fetch up to 500 chapters per batch
    while (offset < total) {
      const params: any = {
        limit,
        offset,
        'order[chapter]': 'desc',
        'contentRating[]': ['safe', 'suggestive', 'erotica'],
      };

      if (preferredLang && preferredLang !== 'all') {
        params['translatedLanguage[]'] = [preferredLang, 'en', 'pt-br'];
      }

      const res = await this.client.get(`/manga/${sourceMangaId}/feed`, { params });
      total = res.data.total;
      const data = res.data.data;

      for (const item of data) {
        const attr = item.attributes;
        const chNum = parseFloat(attr.chapter) || 0;
        const title = attr.title ? `Cap. ${attr.chapter || '—'} - ${attr.title}` : `Capítulo ${attr.chapter || 'Especial'}`;

        chapters.push({
          id: `${this.id}:${sourceMangaId}:${item.id}`,
          mangaId: `${this.id}:${sourceMangaId}`,
          sourceId: this.id,
          sourceChapterId: item.id,
          title,
          chapterNumber: chNum,
          volume: attr.volume ? parseFloat(attr.volume) : null,
          releaseDate: attr.publishAt ? new Date(attr.publishAt).toLocaleDateString() : null,
          scanlator: attr.scanlator || null,
          url: `https://mangadex.org/chapter/${item.id}`,
          isRead: false,
          lastPageRead: 0,
          totalPages: attr.pages || 0,
          isDownloaded: false,
          downloadProgress: 0,
          downloadedPath: null,
        });
      }

      offset += limit;
      // Safeguard against infinite loops
      if (offset >= 1000) break;
    }

    return chapters;
  }

  async getPageList(sourceChapterId: string): Promise<PageImage[]> {
    const res = await this.client.get(`/at-home/server/${sourceChapterId}`);
    const { baseUrl, chapter } = res.data;
    const { hash, data } = chapter;

    return data.map((filename: string, index: number) => ({
      index: index + 1,
      url: `${baseUrl}/data/${hash}/${filename}`,
      headers: {
        'Referer': 'https://mangadex.org',
      },
    }));
  }

  private mapManga(item: any): Manga {
    const attr = item.attributes;
    const mangaId = `${this.id}:${item.id}`;

    // Extract title (English or first available)
    const title = attr.title.en || Object.values(attr.title)[0] || 'Sem Título';

    // Extract alt titles
    const altTitles: string[] = [];
    if (attr.altTitles && Array.isArray(attr.altTitles)) {
      for (const at of attr.altTitles) {
        const val = Object.values(at)[0] as string;
        if (val && !altTitles.includes(val)) altTitles.push(val);
      }
    }

    // Extract description
    const description = attr.description?.pt || attr.description?.['pt-br'] || attr.description?.en || Object.values(attr.description || {})[0] || '';

    // Extract author / artist
    let author = '';
    let artist = '';
    let coverFile = '';

    for (const rel of item.relationships || []) {
      if (rel.type === 'author') author = rel.attributes?.name || author;
      if (rel.type === 'artist') artist = rel.attributes?.name || artist;
      if (rel.type === 'cover_art') coverFile = rel.attributes?.fileName || coverFile;
    }

    // Extract genres
    const genres: string[] = [];
    for (const tag of attr.tags || []) {
      if (tag.attributes?.name?.en) genres.push(tag.attributes.name.en);
    }

    // Cover url
    const coverUrl = coverFile
      ? `https://uploads.mangadex.org/covers/${item.id}/${coverFile}.512.jpg`
      : 'https://placehold.co/400x600/1a1e29/white?text=No+Cover';

    // Status
    let status: Manga['status'] = 'UNKNOWN';
    if (attr.status === 'ongoing') status = 'ONGOING';
    else if (attr.status === 'completed') status = 'COMPLETED';
    else if (attr.status === 'hiatus') status = 'HIATUS';
    else if (attr.status === 'cancelled') status = 'CANCELLED';

    const now = Date.now();

    return {
      id: mangaId,
      sourceId: this.id,
      sourceMangaId: item.id,
      title,
      altTitles: altTitles.slice(0, 5),
      description: typeof description === 'string' ? description : '',
      author,
      artist,
      genres,
      status,
      coverUrl,
      inLibrary: false,
      categoryId: null,
      totalChapters: 0,
      unreadCount: 0,
      downloadedCount: 0,
      lastChapterNumber: parseFloat(attr.lastChapter) || 0,
      lastReadChapterId: null,
      lastReadAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}
