import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseSource } from './BaseSource.js';
import { Manga, Chapter, PageImage, MangaListResult } from '../types/index.js';
import { db } from '../db/database.js';

export class ApkSourceAdapter extends BaseSource {
  id: string;
  name: string;
  version: string;
  lang: string;
  iconUrl: string;
  baseUrl: string;
  pkg: string;
  sourceId: string;
  isNsfw: boolean = false;

  private isSuwayomiBridge: boolean;

  constructor(opts: {
    pkg: string;
    sourceId: string;
    name: string;
    version: string;
    lang: string;
    iconUrl?: string;
    baseUrl?: string;
    isNsfw?: boolean;
  }) {
    super();
    this.pkg = opts.pkg;
    this.sourceId = opts.sourceId;
    this.id = `apk:${opts.pkg}:${opts.sourceId}`;
    this.name = opts.name;
    this.version = opts.version || '1.0.0';
    this.lang = opts.lang || 'all';
    this.iconUrl = opts.iconUrl || '/assets/apk-icon.png';
    this.baseUrl = opts.baseUrl || '';
    this.isNsfw = Boolean(opts.isNsfw);

    this.isSuwayomiBridge = this.pkg.includes('tachidesk') || this.name.toLowerCase().includes('suwayomi');
  }

  async getPopular(page: number = 1): Promise<MangaListResult> {
    if (this.isSuwayomiBridge) {
      return this.handleSuwayomiPopular(page);
    }
    return this.handleWebScraperPopular(page);
  }

  async getLatest(page: number = 1): Promise<MangaListResult> {
    if (this.isSuwayomiBridge) {
      return this.handleSuwayomiLatest(page);
    }
    return this.handleWebScraperLatest(page);
  }

  async search(query: string, page: number = 1): Promise<MangaListResult> {
    if (this.isSuwayomiBridge) {
      return this.handleSuwayomiSearch(query, page);
    }
    return this.handleWebScraperSearch(query, page);
  }

  async getMangaDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    if (this.isSuwayomiBridge) {
      const manga = db.getMangaById(sourceMangaId);
      if (manga) return manga;
      return {
        id: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
        sourceMangaId,
        title: sourceMangaId,
      };
    }
    return this.handleWebScraperDetails(sourceMangaId);
  }

  async getChapterList(sourceMangaId: string): Promise<Chapter[]> {
    if (this.isSuwayomiBridge) {
      const chapters = db.getChapters(sourceMangaId);
      return chapters.map(c => ({
        ...c,
        id: `${this.id}:${sourceMangaId}:${c.sourceChapterId}`,
        mangaId: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
      }));
    }
    return this.handleWebScraperChapters(sourceMangaId);
  }

  async getPageList(sourceChapterId: string, chapterUrl?: string): Promise<PageImage[]> {
    if (this.isSuwayomiBridge) {
      // Find chapter in DB
      const ch = db.getChapterById(sourceChapterId);
      if (ch?.downloadedPath) {
        // Return downloaded offline pages
        const fs = await import('fs');
        const path = await import('path');
        const files = fs.readdirSync(ch.downloadedPath).filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));
        return files.map((file, idx) => ({
          index: idx + 1,
          url: `/api/proxy/local-file?path=${encodeURIComponent(path.join(ch.downloadedPath!, file))}`,
        }));
      }
    }
    return this.handleWebScraperPages(sourceChapterId, chapterUrl);
  }

  // --- Suwayomi Server Bridge implementation ---
  // When Tachiyomi's Suwayomi extension is invoked, it connects to OmniYomi's local catalog & library
  private async handleSuwayomiPopular(page: number): Promise<MangaListResult> {
    const library = db.getLibraryManga();
    if (library.length > 0) {
      const pageSize = 24;
      const start = (page - 1) * pageSize;
      const paged = library.slice(start, start + pageSize).map(m => ({
        ...m,
        id: `${this.id}:${m.id}`,
        sourceId: this.id,
        sourceMangaId: m.id,
      }));

      return {
        manga: paged,
        hasNextPage: start + pageSize < library.length,
        page,
        total: library.length,
      };
    }

    // Fallback: bridge to MangaDex popular
    const { MangaDexSource } = await import('./MangaDexSource.js');
    const md = new MangaDexSource();
    const result = await md.getPopular(page);
    return {
      manga: result.manga.map(m => ({
        ...m,
        id: `${this.id}:${m.sourceMangaId}`,
        sourceId: this.id,
      })),
      hasNextPage: result.hasNextPage,
      page,
      total: result.total,
    };
  }

  private async handleSuwayomiLatest(page: number): Promise<MangaListResult> {
    return this.handleSuwayomiPopular(page);
  }

  private async handleSuwayomiSearch(query: string, page: number): Promise<MangaListResult> {
    const library = db.getLibraryManga(undefined, query);
    if (library.length > 0) {
      return {
        manga: library.map(m => ({ ...m, id: `${this.id}:${m.id}`, sourceId: this.id, sourceMangaId: m.id })),
        hasNextPage: false,
        page,
        total: library.length,
      };
    }

    const { MangaDexSource } = await import('./MangaDexSource.js');
    const md = new MangaDexSource();
    const result = await md.search(query, page);
    return {
      manga: result.manga.map(m => ({ ...m, id: `${this.id}:${m.sourceMangaId}`, sourceId: this.id })),
      hasNextPage: result.hasNextPage,
      page,
      total: result.total,
    };
  }

  // --- Generic Web Scraper Fallback for APK extensions ---
  private async handleWebScraperPopular(page: number): Promise<MangaListResult> {
    if (!this.baseUrl || !this.baseUrl.startsWith('http')) {
      return {
        manga: [],
        hasNextPage: false,
        page,
        total: 0,
      };
    }

    try {
      const url = `${this.baseUrl}/page/${page}/?m_orderby=views`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 15000,
      });

      const $ = cheerio.load(res.data);
      const items: Manga[] = [];

      $('.page-item-detail, .bsx, article').each((_, el) => {
        const link = $(el).find('a').first().attr('href') || '';
        const title = $(el).find('.post-title, h4, h3, .title').text().trim();
        const cover = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
        const idPart = link.replace(this.baseUrl, '').replace(/^\/|\/$/g, '');

        if (idPart && title) {
          items.push({
            id: `${this.id}:${idPart}`,
            sourceId: this.id,
            sourceMangaId: idPart,
            title,
            altTitles: [],
            description: '',
            author: 'Unknown',
            artist: 'Unknown',
            genres: [],
            status: 'ONGOING',
            coverUrl: cover,
            inLibrary: false,
            categoryId: null,
            totalChapters: 0,
            unreadCount: 0,
            downloadedCount: 0,
            lastChapterNumber: 0,
            lastReadChapterId: null,
            lastReadAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      });

      return {
        manga: items,
        hasNextPage: items.length >= 10,
        page,
        total: items.length,
      };
    } catch {
      return { manga: [], hasNextPage: false, page, total: 0 };
    }
  }

  private async handleWebScraperLatest(page: number): Promise<MangaListResult> {
    return this.handleWebScraperPopular(page);
  }

  private async handleWebScraperSearch(query: string, page: number): Promise<MangaListResult> {
    if (!this.baseUrl || !this.baseUrl.startsWith('http')) {
      return { manga: [], hasNextPage: false, page, total: 0 };
    }

    try {
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 15000,
      });

      const $ = cheerio.load(res.data);
      const items: Manga[] = [];

      $('.c-tabs-item__content, .page-item-detail, .bsx').each((_, el) => {
        const link = $(el).find('a').first().attr('href') || '';
        const title = $(el).find('.post-title, h4, h3, .title').text().trim();
        const cover = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
        const idPart = link.replace(this.baseUrl, '').replace(/^\/|\/$/g, '');

        if (idPart && title) {
          items.push({
            id: `${this.id}:${idPart}`,
            sourceId: this.id,
            sourceMangaId: idPart,
            title,
            altTitles: [],
            description: '',
            author: 'Unknown',
            artist: 'Unknown',
            genres: [],
            status: 'ONGOING',
            coverUrl: cover,
            inLibrary: false,
            categoryId: null,
            totalChapters: 0,
            unreadCount: 0,
            downloadedCount: 0,
            lastChapterNumber: 0,
            lastReadChapterId: null,
            lastReadAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      });

      return {
        manga: items,
        hasNextPage: false,
        page,
        total: items.length,
      };
    } catch {
      return { manga: [], hasNextPage: false, page, total: 0 };
    }
  }

  private async handleWebScraperDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    const url = `${this.baseUrl}/${sourceMangaId}`;
    try {
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const title = $('h1').first().text().trim() || sourceMangaId;
      const desc = $('.summary__content, .description-summary, .entry-content').first().text().trim();
      const cover = $('.summary_image img').attr('data-src') || $('.summary_image img').attr('src') || '';

      return {
        id: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
        sourceMangaId,
        title,
        description: desc,
        coverUrl: cover,
      };
    } catch {
      return {
        id: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
        sourceMangaId,
        title: sourceMangaId,
      };
    }
  }

  private async handleWebScraperChapters(sourceMangaId: string): Promise<Chapter[]> {
    const url = `${this.baseUrl}/${sourceMangaId}`;
    try {
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const chapters: Chapter[] = [];

      $('.wp-manga-chapter a, ul.sub-chap a, li a[href*="chapter"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).text().trim();
        const chId = href.replace(this.baseUrl, '').replace(/^\/|\/$/g, '');

        const match = title.match(/(?:ch(?:apter)?\.?|\b)\s*([0-9]+(?:\.[0-9]+)?)/i);
        const chapterNumber = match ? parseFloat(match[1]) : 0;

        if (chId && title) {
          chapters.push({
            id: `${this.id}:${sourceMangaId}:${chId}`,
            mangaId: `${this.id}:${sourceMangaId}`,
            sourceId: this.id,
            sourceChapterId: chId,
            title,
            chapterNumber,
            volume: null,
            releaseDate: null,
            scanlator: null,
            url: href,
            isRead: false,
            lastPageRead: 0,
            totalPages: 0,
            isDownloaded: false,
            downloadProgress: 0,
            downloadedPath: null,
          });
        }
      });

      return chapters;
    } catch {
      return [];
    }
  }

  private async handleWebScraperPages(sourceChapterId: string, chapterUrl?: string): Promise<PageImage[]> {
    const url = chapterUrl || `${this.baseUrl}/${sourceChapterId}`;
    try {
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
      const $ = cheerio.load(res.data);
      const pages: PageImage[] = [];

      $('.reading-content img, #readerarea img, .page-break img').each((i, el) => {
        const src = $(el).attr('data-src') || $(el).attr('src') || '';
        if (src && !src.includes('placeholder')) {
          pages.push({
            index: i + 1,
            url: src.trim(),
            headers: { 'Referer': this.baseUrl },
          });
        }
      });

      return pages;
    } catch {
      return [];
    }
  }
}
