import Database from 'better-sqlite3';
type DatabaseType = InstanceType<typeof Database>;
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Manga, Chapter, Category, DownloadItem, ReadingHistoryItem, AppSettings, SourceManifest } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory at project root/data
const DATA_DIR = path.resolve(process.env.OMNIYOMI_DATA_DIR || path.resolve(__dirname, '../../../data'));
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'omniyomi.db');

export class AppDatabase {
  public db: DatabaseType;
  private closed = false;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        lang TEXT NOT NULL,
        icon_url TEXT,
        base_url TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        is_nsfw INTEGER NOT NULL DEFAULT 0,
        has_popular INTEGER NOT NULL DEFAULT 1,
        has_latest INTEGER NOT NULL DEFAULT 1,
        supports_search INTEGER NOT NULL DEFAULT 1,
        config_json TEXT
      );

      CREATE TABLE IF NOT EXISTS extension_repos (
        url TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_synced INTEGER
      );

      CREATE TABLE IF NOT EXISTS extracted_extensions (
        pkg TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        lang TEXT NOT NULL,
        apk_url TEXT NOT NULL,
        icon_url TEXT,
        extracted_path TEXT NOT NULL,
        sources_json TEXT NOT NULL DEFAULT '[]',
        installed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS manga (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_manga_id TEXT NOT NULL,
        title TEXT NOT NULL,
        alt_titles TEXT NOT NULL DEFAULT '[]',
        description TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        artist TEXT NOT NULL DEFAULT '',
        genres TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'UNKNOWN',
        cover_url TEXT NOT NULL DEFAULT '',
        in_library INTEGER NOT NULL DEFAULT 0,
        category_id TEXT,
        total_chapters INTEGER NOT NULL DEFAULT 0,
        unread_count INTEGER NOT NULL DEFAULT 0,
        downloaded_count INTEGER NOT NULL DEFAULT 0,
        last_chapter_number REAL NOT NULL DEFAULT 0,
        last_read_chapter_id TEXT,
        last_read_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_manga_in_library ON manga(in_library);
      CREATE INDEX IF NOT EXISTS idx_manga_source ON manga(source_id, source_manga_id);

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        manga_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_chapter_id TEXT NOT NULL,
        title TEXT NOT NULL,
        chapter_number REAL NOT NULL DEFAULT 0,
        volume REAL,
        release_date TEXT,
        scanlator TEXT,
        url TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        last_page_read INTEGER NOT NULL DEFAULT 0,
        total_pages INTEGER NOT NULL DEFAULT 0,
        is_downloaded INTEGER NOT NULL DEFAULT 0,
        download_progress INTEGER NOT NULL DEFAULT 0,
        downloaded_path TEXT,
        FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chapters_manga_id ON chapters(manga_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_number ON chapters(manga_id, chapter_number);

      CREATE TABLE IF NOT EXISTS reading_history (
        id TEXT PRIMARY KEY,
        manga_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        page INTEGER NOT NULL DEFAULT 1,
        total_pages INTEGER NOT NULL DEFAULT 0,
        read_at INTEGER NOT NULL,
        FOREIGN KEY (manga_id) REFERENCES manga(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_history_read_at ON reading_history(read_at DESC);

      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL UNIQUE,
        manga_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        manga_title TEXT NOT NULL,
        chapter_title TEXT NOT NULL,
        chapter_number REAL NOT NULL,
        cover_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        progress INTEGER NOT NULL DEFAULT 0,
        total_pages INTEGER NOT NULL DEFAULT 0,
        downloaded_pages INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
    `);

    try {
      this.db.exec(`ALTER TABLE manga ADD COLUMN original_title TEXT;`);
    } catch {
      // column already exists
    }

    try {
      this.db.exec(`ALTER TABLE manga ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`);
    } catch {
      // column already exists
    }

    // Insert default categories if empty
    const catCount = this.db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
    if (catCount.count === 0) {
      const insertCat = this.db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)');
      insertCat.run('default', 'Padrão', 0);
      insertCat.run('reading', 'Lendo', 1);
      insertCat.run('completed', 'Concluídos', 2);
      insertCat.run('plan_to_read', 'Pretendo Ler', 3);
      insertCat.run('favorites', 'Favoritos', 4);
    }

    // Insert default extension repositories
    this.ensureDefaultRepos();
  }

  private ensureDefaultRepos() {
    const repos = [
      { url: 'https://github.com/keiyoushi/extensions/raw/repo/index.pb', name: 'Keiyoushi — catálogo principal (Mihon 1.6)' },
      { url: 'https://raw.githubusercontent.com/FelipeGFA/extensoes/refs/heads/repo/index.pb', name: 'FelipeGFA — extensões PT-BR' },
      { url: 'https://raw.githubusercontent.com/mojuru/cursed-manga-repo/repo/index.pb', name: 'Cursed Yūzōnō — comunidade' },
    ];

    // Migra apenas o URL padrão antigo da Keiyoushi; mantém repositórios personalizados do usuário.
    const legacyKeiyoushi = 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.json';
    const currentKeiyoushi = repos[0].url;
    const legacyExists = Boolean(this.db.prepare('SELECT 1 FROM extension_repos WHERE url = ?').get(legacyKeiyoushi));
    const currentExists = Boolean(this.db.prepare('SELECT 1 FROM extension_repos WHERE url = ?').get(currentKeiyoushi));
    if (legacyExists && !currentExists) {
      this.db.prepare('UPDATE extension_repos SET url = ?, name = ? WHERE url = ?')
        .run(currentKeiyoushi, repos[0].name, legacyKeiyoushi);
    }

    const insertRepo = this.db.prepare(
      'INSERT OR IGNORE INTO extension_repos (url, name, enabled, last_synced) VALUES (?, ?, 1, NULL)'
    );
    for (const r of repos) insertRepo.run(r.url, r.name);

    this.ensureDefaultSettings();
  }

  private ensureDefaultSettings() {
    const defaults: Record<string, string> = {
      downloadPath: path.resolve(DATA_DIR, 'downloads'),
      concurrentDownloads: '2',
      autoUpdateIntervalMinutes: '60',
      defaultReaderMode: 'vertical_webtoon',
      defaultFitMode: 'fit_width',
      pageSpacing: '0',
      autoMarkReadPercent: '85',
      port: '4567',
    };

    const getStmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
    const setStmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    for (const [k, v] of Object.entries(defaults)) {
      if (!getStmt.get(k)) {
        setStmt.run(k, v);
      }
    }
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const map = new Map(rows.map(r => [r.key, r.value]));

    return {
      downloadPath: map.get('downloadPath') || path.resolve(DATA_DIR, 'downloads'),
      concurrentDownloads: parseInt(map.get('concurrentDownloads') || '2', 10),
      autoUpdateIntervalMinutes: parseInt(map.get('autoUpdateIntervalMinutes') || '60', 10),
      defaultReaderMode: (map.get('defaultReaderMode') as any) || 'vertical_webtoon',
      defaultFitMode: (map.get('defaultFitMode') as any) || 'fit_width',
      pageSpacing: parseInt(map.get('pageSpacing') || '0', 10),
      autoMarkReadPercent: parseInt(map.get('autoMarkReadPercent') || '85', 10),
      port: parseInt(map.get('port') || '4567', 10),
      flaresolverrUrl: map.get('flaresolverrUrl') || 'http://localhost:8191/v1',
      flaresolverrEnabled: map.get('flaresolverrEnabled') === 'true',
    };
  }

  public updateSettings(settings: Partial<AppSettings>): AppSettings {
    const setStmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const txn = this.db.transaction((updates: Partial<AppSettings>) => {
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) {
          setStmt.run(k, String(v));
        }
      }
    });
    txn(settings);
    return this.getSettings();
  }

  // --- Manga Methods ---
  public saveOrUpdateManga(manga: Partial<Manga> & { id: string; sourceId: string; sourceMangaId: string; title: string }): Manga {
    const existing = this.getMangaById(manga.id);
    const now = Date.now();

    const item: Manga = {
      id: manga.id,
      sourceId: manga.sourceId,
      sourceName: manga.sourceName ?? existing?.sourceName,
      sourceMangaId: manga.sourceMangaId,
      title: manga.title,
      originalTitle: manga.originalTitle ?? existing?.originalTitle,
      altTitles: manga.altTitles ?? existing?.altTitles ?? [],
      description: manga.description ?? existing?.description ?? '',
      author: manga.author ?? existing?.author ?? '',
      artist: manga.artist ?? existing?.artist ?? '',
      genres: manga.genres ?? existing?.genres ?? [],
      status: manga.status ?? existing?.status ?? 'UNKNOWN',
      coverUrl: manga.coverUrl ?? existing?.coverUrl ?? '',
      inLibrary: manga.inLibrary ?? existing?.inLibrary ?? false,
      isFavorite: manga.isFavorite !== undefined ? Boolean(manga.isFavorite) : Boolean(existing?.isFavorite),
      categoryId: manga.categoryId !== undefined ? manga.categoryId : (existing?.categoryId ?? null),
      totalChapters: manga.totalChapters ?? existing?.totalChapters ?? 0,
      unreadCount: manga.unreadCount ?? existing?.unreadCount ?? 0,
      downloadedCount: manga.downloadedCount ?? existing?.downloadedCount ?? 0,
      lastChapterNumber: manga.lastChapterNumber ?? existing?.lastChapterNumber ?? 0,
      lastReadChapterId: manga.lastReadChapterId !== undefined ? manga.lastReadChapterId : (existing?.lastReadChapterId ?? null),
      lastReadAt: manga.lastReadAt !== undefined ? manga.lastReadAt : (existing?.lastReadAt ?? null),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO manga (
        id, source_id, source_manga_id, title, original_title, alt_titles, description, author, artist, genres,
        status, cover_url, in_library, is_favorite, category_id, total_chapters, unread_count, downloaded_count,
        last_chapter_number, last_read_chapter_id, last_read_at, created_at, updated_at
      ) VALUES (
        @id, @sourceId, @sourceMangaId, @title, @originalTitle, @altTitles, @description, @author, @artist, @genres,
        @status, @coverUrl, @inLibrary, @isFavorite, @categoryId, @totalChapters, @unreadCount, @downloadedCount,
        @lastChapterNumber, @lastReadChapterId, @lastReadAt, @createdAt, @updatedAt
      )
    `);

    stmt.run({
      ...item,
      originalTitle: item.originalTitle || null,
      altTitles: JSON.stringify(item.altTitles),
      genres: JSON.stringify(item.genres),
      inLibrary: item.inLibrary ? 1 : 0,
      isFavorite: item.isFavorite ? 1 : (item.categoryId === 'favorites' ? 1 : 0),
    });

    return item;
  }

  public getMangaById(id: string): Manga | null {
    const row = this.db.prepare('SELECT * FROM manga WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapMangaRow(row);
  }

  public getLibraryManga(categoryId?: string, search?: string): Manga[] {
    let query = 'SELECT * FROM manga WHERE in_library = 1';
    const params: any[] = [];

    if (categoryId && categoryId !== 'all') {
      if (categoryId === 'favorites') {
        query += " AND (category_id = 'favorites' OR is_favorite = 1)";
      } else {
        query += ' AND category_id = ?';
        params.push(categoryId);
      }
    }

    if (search && search.trim()) {
      query += ' AND (title LIKE ? OR author LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    query += ' ORDER BY updated_at DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => this.mapMangaRow(r));
  }

  public setMangaInLibrary(id: string, inLibrary: boolean, categoryId?: string | null): boolean {
    const existing = this.getMangaById(id);
    if (!existing) return false;

    let query = 'UPDATE manga SET in_library = ?, updated_at = ?';
    const params: any[] = [inLibrary ? 1 : 0, Date.now()];

    if (categoryId !== undefined) {
      query += ', category_id = ?';
      params.push(categoryId);
      if (categoryId === 'favorites') {
        query += ', is_favorite = 1';
      }
    }
    query += ' WHERE id = ?';
    params.push(id);

    this.db.prepare(query).run(...params);
    return true;
  }

  public setMangaFavorite(id: string, isFavorite: boolean): Manga | null {
    const existing = this.getMangaById(id);
    if (!existing) return null;

    const now = Date.now();
    if (isFavorite) {
      const targetCategory = existing.categoryId || 'favorites';
      this.db.prepare('UPDATE manga SET is_favorite = 1, in_library = 1, category_id = ?, updated_at = ? WHERE id = ?')
        .run(targetCategory, now, id);
    } else {
      this.db.prepare('UPDATE manga SET is_favorite = 0, updated_at = ? WHERE id = ?')
        .run(now, id);
    }

    return this.getMangaById(id);
  }

  // --- Chapter Methods ---
  public saveChapters(chapters: Chapter[]): void {
    if (chapters.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT INTO chapters (
        id, manga_id, source_id, source_chapter_id, title, chapter_number, volume,
        release_date, scanlator, url, is_read, last_page_read, total_pages,
        is_downloaded, download_progress, downloaded_path
      ) VALUES (
        @id, @mangaId, @sourceId, @sourceChapterId, @title, @chapterNumber, @volume,
        @releaseDate, @scanlator, @url, @isRead, @lastPageRead, @totalPages,
        @isDownloaded, @downloadProgress, @downloadedPath
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        chapter_number = excluded.chapter_number,
        volume = excluded.volume,
        release_date = excluded.release_date,
        scanlator = excluded.scanlator,
        url = excluded.url
    `);

    const insertTxn = this.db.transaction((items: Chapter[]) => {
      for (const ch of items) {
        stmt.run({
          id: ch.id,
          mangaId: ch.mangaId,
          sourceId: ch.sourceId,
          sourceChapterId: ch.sourceChapterId,
          title: ch.title || '',
          chapterNumber: typeof ch.chapterNumber === 'number' ? ch.chapterNumber : 0,
          volume: ch.volume !== undefined ? ch.volume : null,
          releaseDate: ch.releaseDate || (ch as any).date || null,
          scanlator: ch.scanlator || null,
          url: ch.url || '',
          isRead: ch.isRead ? 1 : 0,
          lastPageRead: ch.lastPageRead ?? 0,
          totalPages: ch.totalPages ?? 0,
          isDownloaded: ch.isDownloaded ? 1 : 0,
          downloadProgress: ch.downloadProgress ?? 0,
          downloadedPath: ch.downloadedPath || null,
        });
      }
    });

    insertTxn(chapters);
    this.recalculateMangaCounts(chapters[0].mangaId);
  }

  public getChapters(mangaId: string): Chapter[] {
    const rows = this.db.prepare('SELECT * FROM chapters WHERE manga_id = ? ORDER BY chapter_number DESC').all(mangaId) as any[];
    return rows.map(r => this.mapChapterRow(r));
  }

  public getChapterById(id: string): Chapter | null {
    const row = this.db.prepare('SELECT * FROM chapters WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapChapterRow(row);
  }

  public updateChapterProgress(chapterId: string, page: number, totalPages: number, isRead: boolean): void {
    const chapter = this.getChapterById(chapterId);
    if (!chapter) return;

    this.db.prepare(`
      UPDATE chapters
      SET last_page_read = ?, total_pages = ?, is_read = ?
      WHERE id = ?
    `).run(page, totalPages, isRead ? 1 : 0, chapterId);

    const now = Date.now();

    // Update manga last read
    this.db.prepare(`
      UPDATE manga
      SET last_read_chapter_id = ?, last_read_at = ?, updated_at = ?
      WHERE id = ?
    `).run(chapterId, now, now, chapter.mangaId);

    // Save history
    this.db.prepare(`
      INSERT OR REPLACE INTO reading_history (id, manga_id, chapter_id, page, total_pages, read_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`${chapter.mangaId}:${chapterId}`, chapter.mangaId, chapterId, page, totalPages, now);

    this.recalculateMangaCounts(chapter.mangaId);
  }

  public markChaptersRead(chapterIds: string[], isRead: boolean): void {
    if (chapterIds.length === 0) return;
    const stmt = this.db.prepare('UPDATE chapters SET is_read = ? WHERE id = ?');
    const txn = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(isRead ? 1 : 0, id);
      }
    });
    txn(chapterIds);

    const ch = this.getChapterById(chapterIds[0]);
    if (ch) this.recalculateMangaCounts(ch.mangaId);
  }

  public updateChapterDownloadStatus(chapterId: string, isDownloaded: boolean, downloadedPath?: string | null): void {
    this.db.prepare(`
      UPDATE chapters
      SET is_downloaded = ?, downloaded_path = ?, download_progress = ?
      WHERE id = ?
    `).run(isDownloaded ? 1 : 0, downloadedPath || null, isDownloaded ? 100 : 0, chapterId);

    const ch = this.getChapterById(chapterId);
    if (ch) this.recalculateMangaCounts(ch.mangaId);
  }

  public recalculateMangaCounts(mangaId: string): void {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN is_downloaded = 1 THEN 1 ELSE 0 END) as downloaded,
        MAX(chapter_number) as max_num
      FROM chapters WHERE manga_id = ?
    `).get(mangaId) as any;

    if (stats) {
      this.db.prepare(`
        UPDATE manga
        SET total_chapters = ?, unread_count = ?, downloaded_count = ?, last_chapter_number = ?, updated_at = ?
        WHERE id = ?
      `).run(
        stats.total || 0,
        stats.unread || 0,
        stats.downloaded || 0,
        stats.max_num || 0,
        Date.now(),
        mangaId
      );
    }
  }

  // --- Reading History ---
  public getReadingHistory(limit: number = 50): ReadingHistoryItem[] {
    const rows = this.db.prepare(`
      SELECT
        h.id, h.manga_id, h.chapter_id, h.page, h.total_pages, h.read_at,
        m.title as manga_title, m.cover_url,
        c.title as chapter_title, c.chapter_number
      FROM reading_history h
      JOIN manga m ON h.manga_id = m.id
      JOIN chapters c ON h.chapter_id = c.id
      ORDER BY h.read_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(r => ({
      id: r.id,
      mangaId: r.manga_id,
      chapterId: r.chapter_id,
      mangaTitle: r.manga_title,
      chapterTitle: r.chapter_title,
      chapterNumber: r.chapter_number,
      coverUrl: r.cover_url,
      page: r.page,
      totalPages: r.total_pages,
      readAt: r.read_at,
    }));
  }

  public clearHistory(): void {
    this.db.prepare('DELETE FROM reading_history').run();
  }

  // --- Categories ---
  public getCategories(): Category[] {
    const rows = this.db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
    }));
  }

  public createCategory(name: string): Category {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const maxSort = (this.db.prepare('SELECT MAX(sort_order) as m FROM categories').get() as any)?.m || 0;
    this.db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)').run(id, name, maxSort + 1);
    return { id, name, sortOrder: maxSort + 1 };
  }

  public deleteCategory(id: string): void {
    if (id === 'default') return;
    this.db.prepare("UPDATE manga SET category_id = 'default' WHERE category_id = ?").run(id);
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  // --- Downloads ---
  public addDownload(item: Omit<DownloadItem, 'status' | 'progress' | 'downloadedPages' | 'createdAt'>): DownloadItem {
    const now = Date.now();
    const fullItem: DownloadItem = {
      ...item,
      status: 'PENDING',
      progress: 0,
      downloadedPages: 0,
      createdAt: now,
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO downloads (
        id, chapter_id, manga_id, source_id, manga_title, chapter_title,
        chapter_number, cover_url, status, progress, total_pages, downloaded_pages,
        error, created_at, completed_at
      ) VALUES (
        @id, @chapterId, @mangaId, @sourceId, @mangaTitle, @chapterTitle,
        @chapterNumber, @coverUrl, @status, @progress, @totalPages, @downloadedPages,
        @error, @createdAt, @completedAt
      )
    `).run({
      ...fullItem,
      error: null,
      completedAt: null,
    });

    return fullItem;
  }

  public getDownloads(): DownloadItem[] {
    const rows = this.db.prepare('SELECT * FROM downloads ORDER BY created_at ASC').all() as any[];
    return rows.map(r => this.mapDownloadRow(r));
  }

  public updateDownloadProgress(chapterId: string, status: DownloadItem['status'], downloadedPages: number, totalPages: number, error?: string | null): void {
    const progress = totalPages > 0 ? Math.min(100, Math.round((downloadedPages / totalPages) * 100)) : 0;
    const completedAt = status === 'COMPLETED' ? Date.now() : null;

    this.db.prepare(`
      UPDATE downloads
      SET status = ?, progress = ?, downloaded_pages = ?, total_pages = ?, error = ?, completed_at = COALESCE(?, completed_at)
      WHERE chapter_id = ?
    `).run(status, progress, downloadedPages, totalPages, error || null, completedAt, chapterId);
  }

  public deleteDownload(chapterId: string): void {
    this.db.prepare('DELETE FROM downloads WHERE chapter_id = ?').run(chapterId);
  }

  public clearCompletedDownloads(): void {
    this.db.prepare('DELETE FROM downloads WHERE status = "COMPLETED"').run();
  }

  // --- Source Management ---
  public registerSource(source: SourceManifest): void {
    this.db.prepare(`
      INSERT INTO sources (
        id, name, version, lang, icon_url, base_url, is_enabled, is_nsfw,
        has_popular, has_latest, supports_search
      ) VALUES (
        @id, @name, @version, @lang, @iconUrl, @baseUrl, @isEnabled, @isNsfw,
        @hasPopular, @hasLatest, @supportsSearch
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        version = excluded.version,
        lang = excluded.lang,
        icon_url = excluded.icon_url,
        base_url = excluded.base_url,
        has_popular = excluded.has_popular,
        has_latest = excluded.has_latest,
        supports_search = excluded.supports_search
    `).run({
      ...source,
      isEnabled: source.isEnabled ? 1 : 0,
      isNsfw: source.isNsfw ? 1 : 0,
      hasPopular: source.hasPopular ? 1 : 0,
      hasLatest: source.hasLatest ? 1 : 0,
      supportsSearch: source.supportsSearch ? 1 : 0,
    });
  }

  public getSources(): SourceManifest[] {
    const rows = this.db.prepare('SELECT * FROM sources').all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      version: r.version,
      lang: r.lang,
      iconUrl: r.icon_url,
      baseUrl: r.base_url,
      isEnabled: r.is_enabled === 1,
      isNsfw: r.is_nsfw === 1,
      hasPopular: r.has_popular === 1,
      hasLatest: r.has_latest === 1,
      supportsSearch: r.supports_search === 1,
    }));
  }

  public toggleSource(id: string, isEnabled: boolean): void {
    this.db.prepare('UPDATE sources SET is_enabled = ? WHERE id = ?').run(isEnabled ? 1 : 0, id);
  }

  // --- Extension Repositories ---
  public getExtensionRepos(): any[] {
    const rows = this.db.prepare('SELECT * FROM extension_repos ORDER BY name ASC').all() as any[];
    return rows.map(r => ({
      url: r.url,
      name: r.name,
      enabled: r.enabled === 1,
      lastSynced: r.last_synced,
    }));
  }

  public addExtensionRepo(url: string, name?: string): any {
    const cleanUrl = url.trim();
    const repoName = name?.trim() || new URL(cleanUrl).hostname;
    this.db.prepare(`
      INSERT OR REPLACE INTO extension_repos (url, name, enabled, last_synced)
      VALUES (?, ?, 1, NULL)
    `).run(cleanUrl, repoName);
    return { url: cleanUrl, name: repoName, enabled: true, lastSynced: null };
  }

  public deleteExtensionRepo(url: string): void {
    this.db.prepare('DELETE FROM extension_repos WHERE url = ?').run(url);
  }

  public toggleExtensionRepo(url: string, enabled: boolean): void {
    this.db.prepare('UPDATE extension_repos SET enabled = ? WHERE url = ?').run(enabled ? 1 : 0, url);
  }

  public updateRepoSynced(url: string): void {
    this.db.prepare('UPDATE extension_repos SET last_synced = ? WHERE url = ?').run(Date.now(), url);
  }

  // --- Extracted Extensions (APKs) ---
  public saveExtractedExtension(ext: {
    pkg: string;
    name: string;
    version: string;
    lang: string;
    apkUrl: string;
    iconUrl?: string;
    extractedPath: string;
    sources: any[];
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO extracted_extensions (
        pkg, name, version, lang, apk_url, icon_url, extracted_path, sources_json, installed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ext.pkg,
      ext.name,
      ext.version,
      ext.lang,
      ext.apkUrl,
      ext.iconUrl || null,
      ext.extractedPath,
      JSON.stringify(ext.sources || []),
      Date.now()
    );
  }

  public getExtractedExtensions(): any[] {
    const rows = this.db.prepare('SELECT * FROM extracted_extensions ORDER BY installed_at DESC').all() as any[];
    return rows.map(r => ({
      pkg: r.pkg,
      name: r.name,
      version: r.version,
      lang: r.lang,
      apkUrl: r.apk_url,
      iconUrl: r.icon_url,
      extractedPath: r.extracted_path,
      sources: JSON.parse(r.sources_json || '[]'),
      installedAt: r.installed_at,
    }));
  }

  public deleteExtractedExtension(pkg: string): void {
    this.db.prepare('DELETE FROM extracted_extensions WHERE pkg = ?').run(pkg);
  }

  // --- Desktop lifecycle and SQLite durability ---
  public checkpoint(): void {
    if (this.closed) return;
    this.db.pragma('wal_checkpoint(TRUNCATE)');
  }

  public close(): void {
    if (this.closed) return;
    try {
      this.checkpoint();
    } finally {
      this.db.close();
      this.closed = true;
    }
  }

  // --- Helpers ---
  private mapMangaRow(row: any): Manga {
    return {
      id: row.id,
      sourceId: row.source_id,
      sourceMangaId: row.source_manga_id,
      title: row.title,
      originalTitle: row.original_title || undefined,
      altTitles: JSON.parse(row.alt_titles || '[]'),
      description: row.description,
      author: row.author,
      artist: row.artist,
      genres: JSON.parse(row.genres || '[]'),
      status: row.status,
      coverUrl: row.cover_url,
      inLibrary: row.in_library === 1,
      isFavorite: Boolean(row.is_favorite === 1 || row.category_id === 'favorites'),
      categoryId: row.category_id,
      totalChapters: row.total_chapters,
      unreadCount: row.unread_count,
      downloadedCount: row.downloaded_count,
      lastChapterNumber: row.last_chapter_number,
      lastReadChapterId: row.last_read_chapter_id,
      lastReadAt: row.last_read_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapChapterRow(row: any): Chapter {
    return {
      id: row.id,
      mangaId: row.manga_id,
      sourceId: row.source_id,
      sourceChapterId: row.source_chapter_id,
      title: row.title,
      chapterNumber: row.chapter_number,
      volume: row.volume,
      releaseDate: row.release_date,
      scanlator: row.scanlator,
      url: row.url,
      isRead: row.is_read === 1,
      lastPageRead: row.last_page_read,
      totalPages: row.total_pages,
      isDownloaded: row.is_downloaded === 1,
      downloadProgress: row.download_progress,
      downloadedPath: row.downloaded_path,
    };
  }

  private mapDownloadRow(row: any): DownloadItem {
    return {
      id: row.id,
      chapterId: row.chapter_id,
      mangaId: row.manga_id,
      sourceId: row.source_id,
      mangaTitle: row.manga_title,
      chapterTitle: row.chapter_title,
      chapterNumber: row.chapter_number,
      coverUrl: row.cover_url,
      status: row.status,
      progress: row.progress,
      totalPages: row.total_pages,
      downloadedPages: row.downloaded_pages,
      error: row.error,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}

export const db = new AppDatabase();
