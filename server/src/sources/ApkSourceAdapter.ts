import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseSource } from './BaseSource.js';
import { Manga, Chapter, PageImage, MangaListResult } from '../types/index.js';
import { db } from '../db/database.js';
import { normalizeMangaTitles } from '../services/TitleNormalizer.js';
import { flareSolverrService } from '../services/FlareSolverrService.js';
import { suwayomiService } from '../services/SuwayomiService.js';

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

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
  private isComikey: boolean;
  private isKavita: boolean;

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
    this.baseUrl = (opts.baseUrl || '').replace(/\/+$/, '');
    this.isNsfw = Boolean(opts.isNsfw);

    this.isSuwayomiBridge = this.pkg.includes('tachidesk') || this.name.toLowerCase().includes('suwayomi');
    this.isComikey = this.pkg.includes('comikey') || this.baseUrl.includes('comikey.com');
    this.isKavita = this.pkg.includes('kavita') || this.name.toLowerCase().includes('kavita');
  }

  /**
   * Executa a consulta real da extensão via motor DEX do Suwayomi
   */
  private async executeSuwayomiFetch(
    type: 'POPULAR' | 'LATEST' | 'SEARCH',
    page: number,
    query?: string
  ): Promise<MangaListResult> {
    try {
      const isRunning = await suwayomiService.ensureRunning();
      if (!isRunning) {
        return { manga: [], hasNextPage: false, page, total: 0 };
      }

      const queryPart = query ? `, query: ${JSON.stringify(query)}` : '';
      const gql = `
        mutation {
          fetchSourceManga(input: {
            source: "${this.sourceId}",
            type: ${type},
            page: ${page}${queryPart}
          }) {
            hasNextPage
            mangas {
              id
              title
              thumbnailUrl
              url
              artist
              author
              description
              genre
              status
            }
          }
        }
      `;

      const data = await suwayomiService.queryGql(gql);
      const fetched = data?.fetchSourceManga?.mangas || [];
      const hasNextPage = Boolean(data?.fetchSourceManga?.hasNextPage);

      const suwayomiBase = suwayomiService.getBaseUrl();
      const items: Manga[] = [];

      for (const item of fetched) {
        const normalized = normalizeMangaTitles(item.title, [], this.lang, this.name);
        let coverUrl = item.thumbnailUrl || '';
        if (coverUrl.startsWith('/')) {
          coverUrl = `${suwayomiBase}${coverUrl}`;
        }

        const mangaItem = this.buildMangaItem(String(item.id), item.title, coverUrl, item.author || 'Desconhecido');
        mangaItem.artist = item.artist || mangaItem.artist;
        mangaItem.description = item.description || '';
        mangaItem.status = item.status === 'COMPLETED' ? 'COMPLETED' : 'ONGOING';
        mangaItem.genres = Array.isArray(item.genre) ? item.genre : [];
        items.push(mangaItem);
      }

      return {
        manga: items,
        hasNextPage,
        page,
        total: items.length,
      };
    } catch (err: any) {
      console.warn(`[ApkSourceAdapter] Erro na execução Suwayomi para ${this.name} (${this.sourceId}):`, err.message);
      return { manga: [], hasNextPage: false, page, total: 0 };
    }
  }

  async getPopular(page: number = 1): Promise<MangaListResult> {
    // 1. Tentar execução real no motor DEX do Suwayomi
    try {
      const suwRes = await this.executeSuwayomiFetch('POPULAR', page);
      if (suwRes.manga.length > 0) {
        return suwRes;
      }
    } catch {
      // continua para fallbacks legados se houver
    }

    if (this.isSuwayomiBridge) {
      return this.handleSuwayomiPopular(page);
    }

    if (this.isComikey) {
      const comikeyResult = await this.handleComikeyPopular(page);
      if (comikeyResult.manga.length > 0) return comikeyResult;
    }

    // Try live web scraper
    if (this.baseUrl && this.baseUrl.startsWith('http')) {
      try {
        const liveResult = await this.handleLiveWebScraperPopular(page);
        if (liveResult.manga.length > 0) {
          return liveResult;
        }
      } catch (err: any) {
        console.warn(`[ApkSourceAdapter] Scraper ao vivo falhou para ${this.name} (${this.baseUrl}):`, err.message);
      }
    }

    // Se a fonte não retornou obras, retornar vazio sem poluição entre extensões
    return { manga: [], hasNextPage: false, page, total: 0 };
  }

  async getLatest(page: number = 1): Promise<MangaListResult> {
    // 1. Tentar execução real no motor DEX do Suwayomi
    try {
      const suwRes = await this.executeSuwayomiFetch('LATEST', page);
      if (suwRes.manga.length > 0) {
        return suwRes;
      }
    } catch {
      // continua
    }

    if (this.isSuwayomiBridge) {
      return this.handleSuwayomiLatest(page);
    }

    if (this.isComikey) {
      const comikeyResult = await this.handleComikeyPopular(page);
      if (comikeyResult.manga.length > 0) return comikeyResult;
    }

    if (this.baseUrl && this.baseUrl.startsWith('http')) {
      try {
        const liveResult = await this.handleLiveWebScraperLatest(page);
        if (liveResult.manga.length > 0) {
          return liveResult;
        }
      } catch (err: any) {
        console.warn(`[ApkSourceAdapter] Scraper latest ao vivo falhou para ${this.name}:`, err.message);
      }
    }

    return { manga: [], hasNextPage: false, page, total: 0 };
  }

  async search(query: string, page: number = 1): Promise<MangaListResult> {
    const q = (query || '').trim();
    if (!q) return this.getPopular(page);

    // 1. Tentar pesquisa real no motor DEX do Suwayomi
    try {
      const suwRes = await this.executeSuwayomiFetch('SEARCH', page, q);
      if (suwRes.manga.length > 0) {
        return suwRes;
      }
    } catch {
      // continua
    }

    if (this.isSuwayomiBridge) {
      return this.handleSuwayomiSearch(q, page);
    }

    if (this.isComikey) {
      const comikeyResult = await this.handleComikeySearch(q, page);
      if (comikeyResult.manga.length > 0) return comikeyResult;
    }

    if (this.baseUrl && this.baseUrl.startsWith('http')) {
      try {
        const liveResult = await this.handleLiveWebScraperSearch(q, page);
        if (liveResult.manga.length > 0) {
          return liveResult;
        }
      } catch (err: any) {
        console.warn(`[ApkSourceAdapter] Pesquisa ao vivo falhou para ${this.name}:`, err.message);
      }
    }

    return { manga: [], hasNextPage: false, page, total: 0 };
  }

  async getMangaDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    // 1. Tentar Suwayomi se sourceMangaId for numérico
    const suwId = parseInt(sourceMangaId, 10);
    if (!isNaN(suwId) && (await suwayomiService.isHealthy())) {
      try {
        await suwayomiService.queryGql(`
          mutation {
            fetchMangaAndChapters(input: {
              id: ${suwId},
              fetchManga: true,
              fetchChapters: false
            }) {
              clientMutationId
            }
          }
        `);

        const q = await suwayomiService.queryGql(`
          query {
            manga(id: ${suwId}) {
              id
              title
              artist
              author
              description
              genre
              status
              thumbnailUrl
              url
            }
          }
        `);

        const m = q?.manga;
        if (m) {
          const normalized = normalizeMangaTitles(m.title, [], this.lang, this.name);
          const suwayomiBase = suwayomiService.getBaseUrl();
          let coverUrl = m.thumbnailUrl || '';
          if (coverUrl.startsWith('/')) {
            coverUrl = `${suwayomiBase}${coverUrl}`;
          }

          return {
            id: `${this.id}:${sourceMangaId}`,
            sourceId: this.id,
            sourceMangaId,
            title: normalized.title,
            originalTitle: normalized.originalTitle,
            titleLang: normalized.titleLang,
            metadataSource: this.name,
            coverUrl,
            author: m.author || undefined,
            artist: m.artist || undefined,
            description: m.description || undefined,
            status: m.status === 'COMPLETED' ? 'COMPLETED' : 'ONGOING',
            genres: Array.isArray(m.genre) ? m.genre : [],
          };
        }
      } catch (e: any) {
        console.warn(`[ApkSourceAdapter] getMangaDetails Suwayomi falhou:`, e.message);
      }
    }

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

    if (this.isComikey) {
      try {
        const details = await this.handleComikeyDetails(sourceMangaId);
        if (details.title) return details;
      } catch {
        // continue
      }
    }

    if (this.baseUrl && this.baseUrl.startsWith('http')) {
      try {
        const liveDetails = await this.handleLiveWebScraperDetails(sourceMangaId);
        if (liveDetails.title && liveDetails.title !== sourceMangaId) {
          return liveDetails;
        }
      } catch {
        // continue
      }
    }

    return {
      id: `${this.id}:${sourceMangaId}`,
      sourceId: this.id,
      sourceMangaId,
      title: sourceMangaId.replace(/[-_]/g, ' '),
    };
  }

  async getChapterList(sourceMangaId: string): Promise<Chapter[]> {
    // 1. Tentar Suwayomi se sourceMangaId for numérico
    const suwId = parseInt(sourceMangaId, 10);
    if (!isNaN(suwId) && (await suwayomiService.isHealthy())) {
      const fetchAndRead = async (): Promise<any[]> => {
        await suwayomiService.queryGql(`
          mutation {
            fetchMangaAndChapters(input: {
              id: ${suwId},
              fetchManga: false,
              fetchChapters: true
            }) {
              clientMutationId
            }
          }
        `);

        const q = await suwayomiService.queryGql(`
          query {
            manga(id: ${suwId}) {
              chapters {
                nodes {
                  id
                  chapterNumber
                  name
                  uploadDate
                  url
                  scanlator
                  sourceOrder
                }
              }
            }
          }
        `);
        return q?.manga?.chapters?.nodes || [];
      };

      try {
        let nodes: any[] = [];
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            nodes = await fetchAndRead();
            if (nodes.length > 0) break;
          } catch (error: any) {
            const message = String(error?.message || error);
            if (attempt > 0 || !/no chapters found|timeout|timed out/i.test(message)) {
              throw error;
            }
          }
          if (attempt === 0) {
            console.warn(`[ApkSourceAdapter] Nenhum capítulo retornado para ${sourceMangaId}; repetindo a consulta uma vez.`);
            await new Promise(resolve => setTimeout(resolve, 900));
          }
        }

        if (nodes.length > 0) {
          return nodes.map((c: any, idx: number) => {
            const chapterOrder = typeof c.sourceOrder === 'number' ? c.sourceOrder : (idx + 1);
            return {
              id: `${this.id}:${sourceMangaId}:${c.id}`,
              sourceId: this.id,
              mangaId: `${this.id}:${sourceMangaId}`,
              sourceChapterId: `${sourceMangaId}:${chapterOrder}:${c.id}`,
              chapterNumber: typeof c.chapterNumber === 'number' ? c.chapterNumber : idx + 1,
              title: c.name || `Capítulo ${c.chapterNumber}`,
              url: c.url || '',
              date: c.uploadDate ? new Date(parseInt(c.uploadDate, 10)).toISOString() : undefined,
              scanlator: c.scanlator || undefined,
            };
          });
        }
      } catch (e: any) {
        console.warn(`[ApkSourceAdapter] getChapterList Suwayomi falhou:`, e.message);
      }
    }

    if (this.isSuwayomiBridge) {
      const chapters = db.getChapters(sourceMangaId);
      return chapters.map(c => ({
        ...c,
        id: `${this.id}:${sourceMangaId}:${c.sourceChapterId}`,
        mangaId: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
      }));
    }

    if (this.isComikey) {
      try {
        const chapters = await this.handleComikeyChapters(sourceMangaId);
        if (chapters.length > 0) return chapters;
      } catch {
        // continue
      }
    }

    if (this.baseUrl && this.baseUrl.startsWith('http')) {
      try {
        const liveChapters = await this.handleLiveWebScraperChapters(sourceMangaId);
        if (liveChapters.length > 0) {
          return liveChapters;
        }
      } catch {
        // continue
      }
    }

    return [];
  }

  async getPageList(sourceChapterId: string, chapterUrl?: string): Promise<PageImage[]> {
    // 1. Tentar Suwayomi se Suwayomi estiver disponível
    if (await suwayomiService.isHealthy()) {
      let mangaId: string | null = null;
      let chapterIndex: string | null = null;
      let suwayomiChapterId: number | null = null;

      if (sourceChapterId.includes(':')) {
        const parts = sourceChapterId.split(':');
        if (parts.length >= 3) {
          mangaId = parts[0];
          chapterIndex = parts[1];
          suwayomiChapterId = parseInt(parts[2], 10);
        } else if (parts.length === 2) {
          mangaId = parts[0];
          suwayomiChapterId = parseInt(parts[1], 10);
        }
      } else {
        const parsed = parseInt(sourceChapterId, 10);
        if (!isNaN(parsed)) {
          suwayomiChapterId = parsed;
        }
      }

      if (suwayomiChapterId && !isNaN(suwayomiChapterId)) {
        try {
          // Se não temos mangaId ou chapterIndex (sourceOrder), consultar no Suwayomi
          if (!mangaId || !chapterIndex) {
            const chInfo = await suwayomiService.queryGql(`
              query {
                chapter(id: ${suwayomiChapterId}) {
                  mangaId
                  sourceOrder
                  pageCount
                }
              }
            `);
            if (chInfo?.chapter) {
              mangaId = String(chInfo.chapter.mangaId);
              chapterIndex = String(chInfo.chapter.sourceOrder);
            }
          }

          if (mangaId && chapterIndex) {
            await suwayomiService.queryGql(`
              mutation {
                fetchChapterPages(input: {
                  chapterId: ${suwayomiChapterId}
                }) {
                  clientMutationId
                }
              }
            `);

            const q = await suwayomiService.queryGql(`
              query {
                chapter(id: ${suwayomiChapterId}) {
                  pageCount
                }
              }
            `);

            const pageCount = q?.chapter?.pageCount || 0;
            if (pageCount > 0) {
              const pages: PageImage[] = [];
              for (let i = 0; i < pageCount; i++) {
                const rawUrl = `http://127.0.0.1:4568/api/v1/manga/${mangaId}/chapter/${chapterIndex}/page/${i}`;
                pages.push({
                  index: i + 1,
                  url: `/api/proxy/image?url=${encodeURIComponent(rawUrl)}`,
                });
              }
              return pages;
            }
          }
        } catch (e: any) {
          console.warn(`[ApkSourceAdapter] getPageList Suwayomi falhou:`, e.message);
        }
      }
    }

    if (this.isSuwayomiBridge) {
      const ch = db.getChapterById(sourceChapterId);
      if (ch?.downloadedPath) {
        const fs = await import('fs');
        const path = await import('path');
        const files = fs.readdirSync(ch.downloadedPath).filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));
        return files.map((file, idx) => ({
          index: idx + 1,
          url: `/api/proxy/local-file?path=${encodeURIComponent(path.join(ch.downloadedPath!, file))}`,
        }));
      }
    }

    if (this.baseUrl && this.baseUrl.startsWith('http') && chapterUrl && chapterUrl.startsWith('http')) {
      try {
        const livePages = await this.handleLiveWebScraperPages(sourceChapterId, chapterUrl);
        if (livePages.length > 0) {
          return livePages;
        }
      } catch {
        // continue
      }
    }

    return [];
  }

  // ==========================================
  // --- COMIKEY ENGINE ---
  // ==========================================
  private async handleComikeyPopular(page: number): Promise<MangaListResult> {
    try {
      const targetUrl = `${this.baseUrl || 'https://comikey.com'}/comics/`;
      const res = await axios.get(targetUrl, {
        headers: {
          'User-Agent': DEFAULT_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        },
        timeout: 12000,
      });

      const $ = cheerio.load(res.data);
      const items: Manga[] = [];
      const seen = new Set<string>();

      $('a[href*="/comics/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
        let title = $(el).find('.font-bold, h3, h4, span.title').text().trim() ||
                    $(el).attr('title') ||
                    $(el).find('img').attr('alt') ||
                    '';

        title = title.replace(/^Thumbnail for\s+/i, '').trim();

        // Extract clean slug e.g. /comics/strategy-of-reborn-movie-queen-webtoon/1030/
        const match = href.match(/\/comics\/([^/?#]+)(?:\/([0-9]+))?/i);
        if (match && title && !href.endsWith('/comics/') && !href.includes('?person=')) {
          const slug = match[2] ? `${match[1]}-${match[2]}` : match[1];
          if (!seen.has(slug)) {
            seen.add(slug);
            items.push(this.buildMangaItem(slug, title, img, 'Comikey Media'));
          }
        }
      });

      return {
        manga: items,
        hasNextPage: false,
        page,
        total: items.length,
      };
    } catch (e: any) {
      console.warn('[Comikey] Erro ao raspar comics:', e.message);
      return { manga: [], hasNextPage: false, page, total: 0 };
    }
  }

  private async handleComikeySearch(query: string, page: number): Promise<MangaListResult> {
    const pop = await this.handleComikeyPopular(page);
    const q = query.toLowerCase();
    const filtered = pop.manga.filter(m => m.title.toLowerCase().includes(q));
    return {
      manga: filtered,
      hasNextPage: false,
      page,
      total: filtered.length,
    };
  }

  private async handleComikeyDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    const slugParts = sourceMangaId.split('-');
    const numericId = slugParts[slugParts.length - 1];
    const pathName = isNaN(Number(numericId)) ? sourceMangaId : slugParts.slice(0, -1).join('-');
    const targetUrl = `${this.baseUrl || 'https://comikey.com'}/comics/${pathName}/${numericId ? numericId + '/' : ''}`;

    try {
      const res = await axios.get(targetUrl, { headers: { 'User-Agent': DEFAULT_UA }, timeout: 12000 });
      const $ = cheerio.load(res.data);
      const title = $('h1').first().text().trim() || sourceMangaId;
      const desc = $('meta[name="description"]').attr('content') || $('.description, p.text-sm').first().text().trim();
      const cover = $('meta[property="og:image"]').attr('content') || $('img.cover, .comic-cover img').attr('src') || '';

      return {
        id: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
        sourceMangaId,
        title,
        description: desc,
        coverUrl: cover,
        author: 'Comikey',
        status: 'ONGOING',
      };
    } catch {
      return {
        id: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
        sourceMangaId,
        title: sourceMangaId.replace(/[-_]/g, ' '),
      };
    }
  }

  private async handleComikeyChapters(sourceMangaId: string): Promise<Chapter[]> {
    const slugParts = sourceMangaId.split('-');
    const numericId = slugParts[slugParts.length - 1];
    const pathName = isNaN(Number(numericId)) ? sourceMangaId : slugParts.slice(0, -1).join('-');
    const targetUrl = `${this.baseUrl || 'https://comikey.com'}/comics/${pathName}/${numericId ? numericId + '/' : ''}`;

    try {
      const res = await axios.get(targetUrl, { headers: { 'User-Agent': DEFAULT_UA }, timeout: 12000 });
      const $ = cheerio.load(res.data);
      const chapters: Chapter[] = [];

      $('a[href*="/read/"]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).text().trim() || `Capítulo ${i + 1}`;
        const chSlug = href.split('/').filter(Boolean).pop() || `ch-${i + 1}`;

        chapters.push({
          id: `${this.id}:${sourceMangaId}:${chSlug}`,
          mangaId: `${this.id}:${sourceMangaId}`,
          sourceId: this.id,
          sourceChapterId: chSlug,
          title,
          chapterNumber: i + 1,
          volume: null,
          releaseDate: null,
          scanlator: 'Comikey',
          url: href.startsWith('http') ? href : `https://comikey.com${href}`,
          isRead: false,
          lastPageRead: 0,
          totalPages: 0,
          isDownloaded: false,
          downloadProgress: 0,
          downloadedPath: null,
        });
      });

      return chapters;
    } catch {
      return [];
    }
  }

  // ==========================================
  // --- LIVE MULTI-PATH WEB SCRAPER ---
  // ==========================================
  private async handleLiveWebScraperPopular(page: number): Promise<MangaListResult> {
    const testPaths = [
      `/page/${page}/?m_orderby=views`,
      `/manga/?order=popular&page=${page}`,
      `/comics/?order=popular&page=${page}`,
      `/obras/?order=popular&page=${page}`,
      `/series/?order=popular&page=${page}`,
      `/page/${page}/`,
      '',
    ];

    for (const path of testPaths) {
      try {
        const url = `${this.baseUrl}${path}`;
        const res = await axios.get(url, {
          headers: {
            'User-Agent': DEFAULT_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
            'Referer': this.baseUrl,
          },
          timeout: 10000,
        });

        const $ = cheerio.load(res.data);
        const items = this.extractMangaFromCheerio($);

        if (items.length > 0) {
          return {
            manga: items,
            hasNextPage: items.length >= 10,
            page,
            total: items.length * 10,
          };
        }
      } catch {
        // try next path
      }
    }

    return { manga: [], hasNextPage: false, page, total: 0 };
  }

  private async handleLiveWebScraperLatest(page: number): Promise<MangaListResult> {
    const testPaths = [
      `/page/${page}/?m_orderby=latest`,
      `/manga/?order=update&page=${page}`,
      `/latest/?page=${page}`,
      `/page/${page}/`,
      '',
    ];

    for (const path of testPaths) {
      try {
        const url = `${this.baseUrl}${path}`;
        const res = await axios.get(url, {
          headers: { 'User-Agent': DEFAULT_UA, 'Referer': this.baseUrl },
          timeout: 10000,
        });

        const $ = cheerio.load(res.data);
        const items = this.extractMangaFromCheerio($);

        if (items.length > 0) {
          return {
            manga: items,
            hasNextPage: items.length >= 10,
            page,
            total: items.length * 10,
          };
        }
      } catch {
        // try next
      }
    }

    return { manga: [], hasNextPage: false, page, total: 0 };
  }

  private async handleLiveWebScraperSearch(query: string, page: number): Promise<MangaListResult> {
    const testPaths = [
      `/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      `/?s=${encodeURIComponent(query)}`,
      `/search?q=${encodeURIComponent(query)}`,
      `/manga/?s=${encodeURIComponent(query)}`,
    ];

    for (const path of testPaths) {
      try {
        const url = `${this.baseUrl}${path}`;
        const res = await axios.get(url, {
          headers: { 'User-Agent': DEFAULT_UA, 'Referer': this.baseUrl },
          timeout: 10000,
        });

        const $ = cheerio.load(res.data);
        const items = this.extractMangaFromCheerio($);

        if (items.length > 0) {
          return {
            manga: items,
            hasNextPage: false,
            page,
            total: items.length,
          };
        }
      } catch {
        // try next
      }
    }

    return { manga: [], hasNextPage: false, page, total: 0 };
  }

  private extractMangaFromCheerio($: cheerio.CheerioAPI): Manga[] {
    const items: Manga[] = [];
    const seen = new Set<string>();

    const selectors = [
      '.page-item-detail', '.bsx', '.item-summary', 'article.manga',
      '.manga-card', '.comic-item', '.post-item', '.bixbox .listupd .bs',
      'div.list-truyen-item', '.entry',
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const link = $(el).find('a').first().attr('href') || '';
        const title = $(el).find('.post-title, h4, h3, h2, .title, .tt').first().text().trim();
        const cover = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
        const idPart = link.replace(this.baseUrl, '').replace(/^\/+|\/+$/g, '');

        if (idPart && title && !seen.has(idPart)) {
          seen.add(idPart);
          items.push(this.buildMangaItem(idPart, title, cover));
        }
      });

      if (items.length >= 4) break;
    }

    return items;
  }

  private async handleLiveWebScraperDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    const url = `${this.baseUrl}/${sourceMangaId}`;
    const res = await axios.get(url, { headers: { 'User-Agent': DEFAULT_UA }, timeout: 12000 });
    const $ = cheerio.load(res.data);
    const title = $('h1').first().text().trim() || sourceMangaId;
    const desc = $('.summary__content, .description-summary, .entry-content, .synopsis').first().text().trim();
    const cover = $('.summary_image img, .thumb img').attr('data-src') || $('.summary_image img, .thumb img').attr('src') || '';
    const author = $('.author-content a, .author').first().text().trim() || 'Desconhecido';

    return {
      id: `${this.id}:${sourceMangaId}`,
      sourceId: this.id,
      sourceMangaId,
      title,
      description: desc,
      coverUrl: cover,
      author,
    };
  }

  private async handleLiveWebScraperChapters(sourceMangaId: string): Promise<Chapter[]> {
    const url = `${this.baseUrl}/${sourceMangaId}`;
    let html = '';

    try {
      const res = await axios.get(url, { headers: { 'User-Agent': DEFAULT_UA }, timeout: 12000 });
      html = res.data;
    } catch (err: any) {
      // Se protegido por Cloudflare, tentar FlareSolverr
      if (err.response?.status === 403 || err.response?.status === 503) {
        try {
          const solved = await flareSolverrService.solveChallenge(url);
          html = solved.html;
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    const $ = cheerio.load(html);
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    const extractFromCheerio = ($el: cheerio.CheerioAPI) => {
      $el('.wp-manga-chapter a, ul.sub-chap a, li a[href*="chapter"], .eph-num a, .cl-item a, .chapter-list a').each((i, el) => {
        const href = $el(el).attr('href') || '';
        const title = $el(el).text().trim() || `Capítulo ${i + 1}`;
        const chId = href.replace(this.baseUrl, '').replace(/^\/+|\/+$/g, '');

        const match = title.match(/(?:ch(?:apter)?\.?|\b)\s*([0-9]+(?:\.[0-9]+)?)/i);
        const chapterNumber = match ? parseFloat(match[1]) : i + 1;

        if (chId && !seen.has(chId) && !href.includes('comment')) {
          seen.add(chId);
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
            url: href.startsWith('http') ? href : `${this.baseUrl}/${chId}`,
            isRead: false,
            lastPageRead: 0,
            totalPages: 0,
            isDownloaded: false,
            downloadProgress: 0,
            downloadedPath: null,
          });
        }
      });
    };

    extractFromCheerio($);

    // Tentativa de buscar capítulos completos via Madara AJAX se a lista for curta ou paginada
    try {
      const ajaxUrl = `${this.baseUrl}/wp-admin/admin-ajax.php`;
      const mangaPostId = $('input.rating-post-id, #manga-chapters-holder').attr('data-id');
      if (mangaPostId) {
        const ajaxRes = await axios.post(
          ajaxUrl,
          new URLSearchParams({ action: 'manga_get_chapters', manga: mangaPostId }).toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': DEFAULT_UA }, timeout: 10000 }
        );
        if (ajaxRes.data) {
          const $ajax = cheerio.load(ajaxRes.data);
          extractFromCheerio($ajax);
        }
      }
    } catch {
      // continua com capítulos extraídos
    }

    return chapters;
  }

  private async handleLiveWebScraperPages(sourceChapterId: string, chapterUrl?: string): Promise<PageImage[]> {
    const url = chapterUrl || `${this.baseUrl}/${sourceChapterId}`;
    const res = await axios.get(url, { headers: { 'User-Agent': DEFAULT_UA, 'Referer': this.baseUrl }, timeout: 15000 });
    const $ = cheerio.load(res.data);
    const pages: PageImage[] = [];

    $('.reading-content img, #readerarea img, .page-break img, .wp-manga-chapter-img').each((i, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src') || '';
      if (src && !src.includes('placeholder') && !src.includes('logo')) {
        pages.push({
          index: i + 1,
          url: src.trim(),
          headers: { 'Referer': this.baseUrl },
        });
      }
    });

    return pages;
  }

  // ==========================================
  // --- RESILIENT LANGUAGE BRIDGE SYSTEM ---
  // Guarantees that ALL extensions return real works without failures
  // ==========================================
  private getTargetLanguage(): string {
    const l = (this.lang || '').toLowerCase();
    if (l.includes('pt') || l.includes('br')) return 'pt-br';
    if (l.includes('es')) return 'es';
    if (l.includes('fr')) return 'fr';
    if (l.includes('ja')) return 'ja';
    if (l.includes('ko')) return 'ko';
    if (l.includes('ar')) return 'ar';
    return 'en';
  }

  private async handleLanguageBridgePopular(page: number): Promise<MangaListResult> {
    const targetLang = this.getTargetLanguage();
    try {
      const { MangaDexSource } = await import('./MangaDexSource.js');
      const md = new MangaDexSource();
      const offset = (page - 1) * 24;

      const langs = targetLang === 'pt-br' ? ['pt-br', 'pt'] : [targetLang, 'en'];
      const langParams = langs.map(l => `availableTranslatedLanguage[]=${l}`).join('&');

      const url = `https://api.mangadex.org/manga?limit=24&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive&${langParams}`;
      const res = await axios.get(url, { headers: { 'User-Agent': 'OmniYomi/1.0' }, timeout: 15000 });

      const data = res.data;
      const mangaList: Manga[] = (data.data || []).map((item: any) => {
        const coverRel = item.relationships?.find((r: any) => r.type === 'cover_art');
        const fileName = coverRel?.attributes?.fileName;
        const coverUrl = fileName ? `https://uploads.mangadex.org/covers/${item.id}/${fileName}.512.jpg` : '';
        const rawTitle = item.attributes?.title?.['pt-br'] || item.attributes?.title?.pt || item.attributes?.title?.en || Object.values(item.attributes?.title || {})[0] || 'Sem título';
        const rawAlts = (item.attributes?.altTitles || []).map((at: any) => Object.values(at)[0]).filter(Boolean);
        const { title, originalTitle, altTitles } = normalizeMangaTitles(String(rawTitle), rawAlts, targetLang);
        const desc = item.attributes?.description?.['pt-br'] || item.attributes?.description?.en || '';

        return {
          id: `${this.id}:${item.id}`,
          sourceId: this.id,
          sourceName: this.name,
          sourceMangaId: item.id,
          title,
          originalTitle,
          altTitles,
          description: desc,
          author: 'MangaDex Bridge',
          artist: 'MangaDex Bridge',
          genres: [],
          status: 'ONGOING',
          coverUrl,
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
        };
      });

      return {
        manga: mangaList,
        hasNextPage: offset + 24 < (data.total || 0),
        page,
        total: data.total || mangaList.length,
      };
    } catch (e: any) {
      console.warn(`[ApkSourceAdapter] Fallback popular falhou para ${this.name}:`, e.message);
      // Emergency fallback: local library
      return this.handleSuwayomiPopular(page);
    }
  }

  private async handleLanguageBridgeSearch(query: string, page: number): Promise<MangaListResult> {
    const targetLang = this.getTargetLanguage();
    try {
      const offset = (page - 1) * 24;
      const langs = targetLang === 'pt-br' ? ['pt-br', 'pt'] : [targetLang, 'en'];
      const langParams = langs.map(l => `availableTranslatedLanguage[]=${l}`).join('&');

      const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=24&offset=${offset}&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&${langParams}`;
      const res = await axios.get(url, { headers: { 'User-Agent': 'OmniYomi/1.0' }, timeout: 15000 });

      const data = res.data;
      const mangaList: Manga[] = (data.data || []).map((item: any) => {
        const coverRel = item.relationships?.find((r: any) => r.type === 'cover_art');
        const fileName = coverRel?.attributes?.fileName;
        const coverUrl = fileName ? `https://uploads.mangadex.org/covers/${item.id}/${fileName}.512.jpg` : '';
        const rawTitle = item.attributes?.title?.['pt-br'] || item.attributes?.title?.pt || item.attributes?.title?.en || Object.values(item.attributes?.title || {})[0] || 'Sem título';
        const rawAlts = (item.attributes?.altTitles || []).map((at: any) => Object.values(at)[0]).filter(Boolean);
        const { title, originalTitle, altTitles } = normalizeMangaTitles(String(rawTitle), rawAlts, targetLang);
        const desc = item.attributes?.description?.['pt-br'] || item.attributes?.description?.en || '';

        return {
          id: `${this.id}:${item.id}`,
          sourceId: this.id,
          sourceName: this.name,
          sourceMangaId: item.id,
          title,
          originalTitle,
          altTitles,
          description: desc,
          author: 'MangaDex Bridge',
          artist: 'MangaDex Bridge',
          genres: [],
          status: 'ONGOING',
          coverUrl,
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
        };
      });

      return {
        manga: mangaList,
        hasNextPage: offset + 24 < (data.total || 0),
        page,
        total: data.total || mangaList.length,
      };
    } catch {
      return { manga: [], hasNextPage: false, page, total: 0 };
    }
  }

  private async handleLanguageBridgeDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    try {
      const { MangaDexSource } = await import('./MangaDexSource.js');
      const md = new MangaDexSource();
      const details = await md.getMangaDetails(sourceMangaId);
      return {
        ...details,
        id: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
        sourceMangaId,
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

  private async handleLanguageBridgeChapters(sourceMangaId: string): Promise<Chapter[]> {
    try {
      const { MangaDexSource } = await import('./MangaDexSource.js');
      const md = new MangaDexSource();
      const chapters = await md.getChapterList(sourceMangaId);
      return chapters.map(c => ({
        ...c,
        id: `${this.id}:${sourceMangaId}:${c.sourceChapterId}`,
        mangaId: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
      }));
    } catch {
      return [];
    }
  }

  private async handleLanguageBridgePages(sourceChapterId: string): Promise<PageImage[]> {
    try {
      const { MangaDexSource } = await import('./MangaDexSource.js');
      const md = new MangaDexSource();
      return await md.getPageList(sourceChapterId);
    } catch {
      return [];
    }
  }

  // --- Suwayomi Server Bridge implementation ---
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

  private buildMangaItem(idPart: string, rawTitle: string, cover: string, author: string = 'Desconhecido', rawAlts: string[] = []): Manga {
    const { title, titleLang, originalTitle, altTitles } = normalizeMangaTitles(
      rawTitle,
      rawAlts,
      this.getTargetLanguage(),
      this.name
    );

    let validCover = cover ? cover.trim() : '';
    if (validCover && !validCover.startsWith('http') && this.baseUrl) {
      try {
        validCover = new URL(validCover, this.baseUrl).href;
      } catch {
        // keep as is
      }
    }

    return {
      id: `${this.id}:${idPart}`,
      sourceId: this.id,
      sourceName: this.name,
      sourceMangaId: idPart,
      title,
      titleLang,
      originalTitle,
      altTitles,
      metadataSource: this.name,
      description: '',
      author,
      artist: author,
      genres: [],
      status: 'ONGOING',
      coverUrl: validCover,
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
    };
  }
}
