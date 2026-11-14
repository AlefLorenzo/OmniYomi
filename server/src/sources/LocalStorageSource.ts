import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';
import { BaseSource } from './BaseSource.js';
import { Manga, Chapter, PageImage, MangaListResult } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_MANGA_DIR = path.resolve(__dirname, '../../../data/local_manga');

if (!fs.existsSync(LOCAL_MANGA_DIR)) {
  fs.mkdirSync(LOCAL_MANGA_DIR, { recursive: true });
}

export class LocalStorageSource extends BaseSource {
  id = 'local';
  name = 'Armazenamento Local (Offline)';
  version = '1.0.0';
  lang = 'pt-br';
  iconUrl = '/assets/local-source.png';
  baseUrl = 'file://local';
  isNsfw = false;

  private supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

  getStorageDir(): string {
    return LOCAL_MANGA_DIR;
  }

  async getPopular(page: number = 1): Promise<MangaListResult> {
    return this.scanLocalManga(page);
  }

  async getLatest(page: number = 1): Promise<MangaListResult> {
    return this.scanLocalManga(page);
  }

  async search(query: string, page: number = 1): Promise<MangaListResult> {
    return this.scanLocalManga(page, query);
  }

  private scanLocalManga(page: number = 1, query?: string): MangaListResult {
    if (!fs.existsSync(LOCAL_MANGA_DIR)) {
      return { manga: [], hasNextPage: false, page, total: 0 };
    }

    const entries = fs.readdirSync(LOCAL_MANGA_DIR, { withFileTypes: true });
    let mangaDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      mangaDirs = mangaDirs.filter(name => name.toLowerCase().includes(q));
    }

    const pageSize = 24;
    const start = (page - 1) * pageSize;
    const pagedDirs = mangaDirs.slice(start, start + pageSize);

    const mangaList: Manga[] = pagedDirs.map(dirName => {
      const dirPath = path.join(LOCAL_MANGA_DIR, dirName);
      let coverUrl = '/placeholder-cover.jpg';

      // Look for cover image in the folder
      try {
        const files = fs.readdirSync(dirPath);
        const coverFile = files.find(f => {
          const lower = f.toLowerCase();
          return lower.startsWith('cover.') || lower.startsWith('folder.') || lower.startsWith('poster.');
        }) || files.find(f => this.supportedExtensions.some(ext => f.toLowerCase().endsWith(ext)));

        if (coverFile) {
          coverUrl = `/api/proxy/local-file?path=${encodeURIComponent(path.join(dirPath, coverFile))}`;
        }
      } catch {
        // ignore
      }

      const now = Date.now();
      return {
        id: `local:${dirName}`,
        sourceId: this.id,
        sourceMangaId: dirName,
        title: dirName,
        altTitles: [],
        description: 'Mangá/Manhwa armazenado localmente no dispositivo.',
        author: 'Local',
        artist: 'Local',
        genres: ['Local', 'Offline'],
        status: 'COMPLETED',
        coverUrl,
        inLibrary: true,
        categoryId: 'default',
        totalChapters: 0,
        unreadCount: 0,
        downloadedCount: 0,
        lastChapterNumber: 0,
        lastReadChapterId: null,
        lastReadAt: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    return {
      manga: mangaList,
      hasNextPage: start + pageSize < mangaDirs.length,
      page,
      total: mangaDirs.length,
    };
  }

  async getMangaDetails(sourceMangaId: string): Promise<Partial<Manga>> {
    const dirPath = path.join(LOCAL_MANGA_DIR, sourceMangaId);
    let coverUrl = '/placeholder-cover.jpg';

    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      const coverFile = files.find(f => {
        const lower = f.toLowerCase();
        return lower.startsWith('cover.') || lower.startsWith('folder.');
      }) || files.find(f => this.supportedExtensions.some(ext => f.toLowerCase().endsWith(ext)));

      if (coverFile) {
        coverUrl = `/api/proxy/local-file?path=${encodeURIComponent(path.join(dirPath, coverFile))}`;
      }
    }

    return {
      id: `local:${sourceMangaId}`,
      sourceId: this.id,
      sourceMangaId,
      title: sourceMangaId,
      altTitles: [],
      description: 'Mangá/Manhwa armazenado no diretório local de arquivos.',
      author: 'Local',
      artist: 'Local',
      genres: ['Local', 'Offline'],
      status: 'COMPLETED',
      coverUrl,
    };
  }

  async getChapterList(sourceMangaId: string): Promise<Chapter[]> {
    const mangaDir = path.join(LOCAL_MANGA_DIR, sourceMangaId);
    if (!fs.existsSync(mangaDir)) return [];

    const entries = fs.readdirSync(mangaDir, { withFileTypes: true });
    const chapters: Chapter[] = [];

    for (const entry of entries) {
      let isChapter = false;
      let chapterName = entry.name;
      let isArchive = false;
      const fullPath = path.join(mangaDir, entry.name);

      if (entry.isDirectory()) {
        isChapter = true;
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.cbz' || ext === '.zip') {
          isChapter = true;
          isArchive = true;
          chapterName = path.basename(entry.name, ext);
        }
      }

      if (isChapter) {
        // Parse chapter number
        const match = chapterName.match(/(?:ch(?:apter)?\.?|cap(?:[íi]tulo)?\.?|\b)\s*([0-9]+(?:\.[0-9]+)?)/i);
        const chapterNumber = match ? parseFloat(match[1]) : 0;

        let totalPages = 0;
        try {
          if (isArchive) {
            const zip = new AdmZip(fullPath);
            const zipEntries = zip.getEntries();
            totalPages = zipEntries.filter(e => !e.isDirectory && this.supportedExtensions.some(ext => e.entryName.toLowerCase().endsWith(ext))).length;
          } else {
            const files = fs.readdirSync(fullPath);
            totalPages = files.filter(f => this.supportedExtensions.some(ext => f.toLowerCase().endsWith(ext))).length;
          }
        } catch {
          totalPages = 0;
        }

        chapters.push({
          id: `local:${sourceMangaId}:${entry.name}`,
          mangaId: `local:${sourceMangaId}`,
          sourceId: this.id,
          sourceChapterId: entry.name,
          title: chapterName,
          chapterNumber,
          volume: null,
          releaseDate: new Date(fs.statSync(fullPath).mtime).toLocaleDateString(),
          scanlator: 'Local File',
          url: null,
          isRead: false,
          lastPageRead: 0,
          totalPages,
          isDownloaded: true,
          downloadProgress: 100,
          downloadedPath: fullPath,
        });
      }
    }

    // Sort chapters descending by chapter number
    chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
    return chapters;
  }

  async getPageList(sourceChapterId: string, _chapterUrl?: string): Promise<PageImage[]> {
    // Find chapter path
    // sourceChapterId could be entry.name
    // We scan directories in LOCAL_MANGA_DIR
    const mangaDirs = fs.readdirSync(LOCAL_MANGA_DIR, { withFileTypes: true }).filter(e => e.isDirectory());
    let targetPath: string | null = null;

    for (const dir of mangaDirs) {
      const candidate = path.join(LOCAL_MANGA_DIR, dir.name, sourceChapterId);
      if (fs.existsSync(candidate)) {
        targetPath = candidate;
        break;
      }
    }

    if (!targetPath) {
      throw new Error(`Capítulo local não encontrado: ${sourceChapterId}`);
    }

    const pages: PageImage[] = [];
    const ext = path.extname(targetPath).toLowerCase();

    if (ext === '.cbz' || ext === '.zip') {
      const zip = new AdmZip(targetPath);
      const zipEntries = zip.getEntries()
        .filter(e => !e.isDirectory && this.supportedExtensions.some(x => e.entryName.toLowerCase().endsWith(x)))
        .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }));

      zipEntries.forEach((entry, idx) => {
        pages.push({
          index: idx + 1,
          url: `/api/proxy/local-archive-page?archivePath=${encodeURIComponent(targetPath!)}&entryName=${encodeURIComponent(entry.entryName)}`,
          localPath: `${targetPath}#${entry.entryName}`,
        });
      });
    } else if (fs.statSync(targetPath).isDirectory()) {
      const files = fs.readdirSync(targetPath)
        .filter(f => this.supportedExtensions.some(x => f.toLowerCase().endsWith(x)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      files.forEach((file, idx) => {
        const filePath = path.join(targetPath!, file);
        pages.push({
          index: idx + 1,
          url: `/api/proxy/local-file?path=${encodeURIComponent(filePath)}`,
          localPath: filePath,
        });
      });
    }

    return pages;
  }
}

