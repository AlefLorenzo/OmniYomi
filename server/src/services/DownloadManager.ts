import fs from 'fs';
import path from 'path';
import axios from 'axios';
// archiver removed - using native fs for archive creation
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
import { DownloadItem, Chapter, PageImage } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DownloadManager extends EventEmitter {
  private isProcessing = false;
  private activeWorkers = 0;
  private paused = false;
  private activeControllers: Map<string, AbortController> = new Map();

  constructor() {
    super();
    // Reset any stuck DOWNLOADING state on startup
    this.recoverInterruptedDownloads();
  }

  private recoverInterruptedDownloads() {
    const downloads = db.getDownloads();
    for (const d of downloads) {
      if (d.status === 'DOWNLOADING') {
        db.updateDownloadProgress(d.chapterId, 'PENDING', d.downloadedPages, d.totalPages, 'Interrompido na reinicialização');
      }
    }
  }

  public getDownloadPath(): string {
    const settings = db.getSettings();
    const downloadDir = settings.downloadPath || path.resolve(__dirname, '../../../data/downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    return downloadDir;
  }

  public sanitizeName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'unnamed';
  }

  public async enqueue(chapter: Chapter, mangaTitle: string, coverUrl: string): Promise<DownloadItem> {
    // Check if already downloaded
    if (chapter.isDownloaded && chapter.downloadedPath && fs.existsSync(chapter.downloadedPath)) {
      throw new Error(`Capítulo "${chapter.title}" já se encontra baixado.`);
    }

    const item: Omit<DownloadItem, 'status' | 'progress' | 'downloadedPages' | 'createdAt'> = {
      id: `dl_${chapter.id}`,
      chapterId: chapter.id,
      mangaId: chapter.mangaId,
      sourceId: chapter.sourceId,
      mangaTitle,
      chapterTitle: chapter.title,
      chapterNumber: chapter.chapterNumber,
      coverUrl,
      totalPages: chapter.totalPages || 0,
    };

    const queued = db.addDownload(item);
    this.emit('queue_updated', queued);
    this.processQueue();
    return queued;
  }

  public async enqueueBatch(chapters: Chapter[], mangaTitle: string, coverUrl: string): Promise<number> {
    let count = 0;
    for (const ch of chapters) {
      try {
        await this.enqueue(ch, mangaTitle, coverUrl);
        count++;
      } catch {
        // Skip already downloaded or duplicate
      }
    }
    return count;
  }

  public pause() {
    this.paused = true;
    this.emit('paused');
  }

  public resume() {
    this.paused = false;
    this.emit('resumed');
    this.processQueue();
  }

  public cancel(chapterId: string) {
    const controller = this.activeControllers.get(chapterId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(chapterId);
    }
    db.deleteDownload(chapterId);
    this.emit('download_cancelled', { chapterId });
  }

  public clearCompleted() {
    db.clearCompletedDownloads();
    this.emit('queue_updated');
  }

  public async deleteDownloadedChapter(chapterId: string): Promise<boolean> {
    const ch = db.getChapterById(chapterId);
    if (!ch) return false;

    if (ch.downloadedPath && fs.existsSync(ch.downloadedPath)) {
      try {
        if (fs.statSync(ch.downloadedPath).isDirectory()) {
          fs.rmSync(ch.downloadedPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(ch.downloadedPath);
        }
      } catch (e: any) {
        console.error('Erro ao deletar arquivos do capítulo:', e.message);
      }
    }

    db.updateChapterDownloadStatus(chapterId, false, null);
    db.deleteDownload(chapterId);
    this.emit('download_deleted', { chapterId });
    return true;
  }

  public getStorageUsage(): { totalBytes: number; formatted: string } {
    const baseDir = this.getDownloadPath();
    let totalBytes = 0;

    const calcDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        try {
          if (ent.isDirectory()) {
            calcDir(full);
          } else if (ent.isFile()) {
            totalBytes += fs.statSync(full).size;
          }
        } catch {
          // ignore permission errors
        }
      }
    };

    calcDir(baseDir);

    const mb = totalBytes / (1024 * 1024);
    const gb = mb / 1024;
    const formatted = gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(1)} MB`;

    return { totalBytes, formatted };
  }

  private async processQueue() {
    if (this.paused || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const settings = db.getSettings();
      const maxConcurrency = Math.max(1, settings.concurrentDownloads || 2);

      while (!this.paused && this.activeWorkers < maxConcurrency) {
        const queue = db.getDownloads();
        const pending = queue.find(d => d.status === 'PENDING');
        if (!pending) break;

        this.activeWorkers++;
        this.downloadChapter(pending).finally(() => {
          this.activeWorkers--;
          this.processQueue();
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async downloadChapter(item: DownloadItem) {
    const controller = new AbortController();
    this.activeControllers.set(item.chapterId, controller);

    db.updateDownloadProgress(item.chapterId, 'DOWNLOADING', item.downloadedPages, item.totalPages);
    this.emit('progress', { chapterId: item.chapterId, status: 'DOWNLOADING', progress: item.progress });

    const source = extensionManager.getSource(item.sourceId);
    if (!source) {
      db.updateDownloadProgress(item.chapterId, 'FAILED', 0, 0, `Fonte "${item.sourceId}" não encontrada.`);
      this.activeControllers.delete(item.chapterId);
      return;
    }

    try {
      const chapter = db.getChapterById(item.chapterId);
      const sourceChapterId = chapter?.sourceChapterId || item.chapterId.split(':').pop()!;

      // 1. Fetch page list
      const pages = await source.getPageList(sourceChapterId, chapter?.url || undefined);
      if (!pages || pages.length === 0) {
        throw new Error('Nenhuma página retornada pela fonte para este capítulo.');
      }

      const totalPages = pages.length;
      db.updateDownloadProgress(item.chapterId, 'DOWNLOADING', 0, totalPages);

      // 2. Prepare directory
      const baseDownloadDir = this.getDownloadPath();
      const safeSource = this.sanitizeName(item.sourceId);
      const safeManga = this.sanitizeName(item.mangaTitle);
      const safeChapter = this.sanitizeName(item.chapterTitle || `Capítulo ${item.chapterNumber}`);
      const targetDir = path.join(baseDownloadDir, safeSource, safeManga, safeChapter);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // 3. Download pages with resume capability and verification
      let downloadedPages = 0;

      for (let i = 0; i < pages.length; i++) {
        if (controller.signal.aborted) {
          throw new Error('Download cancelado pelo usuário.');
        }

        const page = pages[i];
        const ext = this.detectExtensionFromUrl(page.url);
        const fileName = `page-${String(page.index).padStart(3, '0')}${ext}`;
        const filePath = path.join(targetDir, fileName);

        // Resume: if file exists and is valid image, skip redownload
        if (fs.existsSync(filePath) && this.isValidImageFile(filePath)) {
          downloadedPages++;
          db.updateDownloadProgress(item.chapterId, 'DOWNLOADING', downloadedPages, totalPages);
          this.emit('progress', {
            chapterId: item.chapterId,
            status: 'DOWNLOADING',
            progress: Math.round((downloadedPages / totalPages) * 100),
            downloadedPages,
            totalPages,
          });
          continue;
        }

        // Retry loop for each page (up to 3 attempts with exponential delay)
        let downloaded = false;
        let lastErr = '';

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await this.downloadImageFile(page.url, filePath, page.headers, controller.signal);
            if (this.isValidImageFile(filePath)) {
              downloaded = true;
              break;
            } else {
              // Remove corrupt file
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              throw new Error('Arquivo de imagem baixado está corrompido ou incompleto.');
            }
          } catch (err: any) {
            lastErr = err.message || 'Erro de conexão';
            if (controller.signal.aborted) throw err;
            await new Promise(r => setTimeout(r, attempt * 1000));
          }
        }

        if (!downloaded) {
          throw new Error(`Falha ao baixar página ${page.index}: ${lastErr}`);
        }

        downloadedPages++;
        db.updateDownloadProgress(item.chapterId, 'DOWNLOADING', downloadedPages, totalPages);
        this.emit('progress', {
          chapterId: item.chapterId,
          status: 'DOWNLOADING',
          progress: Math.round((downloadedPages / totalPages) * 100),
          downloadedPages,
          totalPages,
        });
      }

      // 4. Mark completed in DB
      db.updateDownloadProgress(item.chapterId, 'COMPLETED', totalPages, totalPages);
      db.updateChapterDownloadStatus(item.chapterId, true, targetDir);

      this.emit('completed', {
        chapterId: item.chapterId,
        targetDir,
      });

    } catch (err: any) {
      if (controller.signal.aborted) {
        db.updateDownloadProgress(item.chapterId, 'CANCELLED', 0, 0, 'Cancelado');
      } else {
        console.error(`Erro no download do capítulo ${item.chapterId}:`, err.message);
        db.updateDownloadProgress(item.chapterId, 'FAILED', 0, 0, err.message);
      }
      this.emit('error', { chapterId: item.chapterId, error: err.message });
    } finally {
      this.activeControllers.delete(item.chapterId);
    }
  }

  public resolveActualImageUrl(url: string): string {
    if (!url) return '';
    // Extrai URL real se estiver envelopada em /api/proxy/image?url=...
    if (url.includes('/api/proxy/image') && url.includes('url=')) {
      try {
        const queryPart = url.split('url=')[1];
        const rawParam = queryPart.split('&')[0];
        const decoded = decodeURIComponent(rawParam);
        if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
          return decoded;
        }
      } catch {
        // fallback
      }
    }
    // Se for URL relativa interna, aponta para o servidor local
    if (url.startsWith('/')) {
      return `http://127.0.0.1:4567${url}`;
    }
    return url;
  }

  private async downloadImageFile(url: string, destPath: string, customHeaders?: Record<string, string>, signal?: AbortSignal): Promise<void> {
    const targetUrl = this.resolveActualImageUrl(url);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ...customHeaders,
    };

    if (!headers['Referer'] && targetUrl.startsWith('http')) {
      try {
        const parsed = new URL(targetUrl);
        if (!parsed.hostname.includes('127.0.0.1') && !parsed.hostname.includes('localhost')) {
          headers['Referer'] = parsed.origin;
        }
      } catch {
        // ignore
      }
    }

    const res = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      timeout: 30000,
      headers,
      signal,
    });

    const writer = fs.createWriteStream(destPath);
    res.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  // Verifies magic number headers for JPG, PNG, WEBP, GIF
  public isValidImageFile(filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < 512) return false; // Images under 512 bytes are almost always error pages

      const buffer = Buffer.alloc(12);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 12, 0);
      fs.closeSync(fd);

      // JPEG: FF D8 FF
      if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;

      // GIF: 47 49 46 38
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;

      // WEBP: RIFF .... WEBP
      if (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
      ) return true;

      return false;
    } catch {
      return false;
    }
  }

  private detectExtensionFromUrl(url: string): string {
    const actual = this.resolveActualImageUrl(url);
    const clean = actual.split('?')[0].toLowerCase();
    if (clean.endsWith('.png')) return '.png';
    if (clean.endsWith('.webp')) return '.webp';
    if (clean.endsWith('.gif')) return '.gif';
    if (clean.endsWith('.jpeg')) return '.jpeg';
    if (clean.endsWith('.avif')) return '.avif';
    return '.jpg';
  }

  // Scanner to import pre-existing chapters in local folders into DB
  public scanAndRegisterExistingDownloads(): number {
    const baseDir = this.getDownloadPath();
    if (!fs.existsSync(baseDir)) return 0;

    let registeredCount = 0;
    const sources = fs.readdirSync(baseDir, { withFileTypes: true }).filter(s => s.isDirectory());

    for (const src of sources) {
      const sourceId = src.name;
      const mangaList = fs.readdirSync(path.join(baseDir, sourceId), { withFileTypes: true }).filter(m => m.isDirectory());

      for (const m of mangaList) {
        const mangaDir = path.join(baseDir, sourceId, m.name);
        const chapterList = fs.readdirSync(mangaDir, { withFileTypes: true }).filter(c => c.isDirectory());

        for (const ch of chapterList) {
          const chDir = path.join(mangaDir, ch.name);
          const images = fs.readdirSync(chDir).filter(f => this.isValidImageFile(path.join(chDir, f)));

          if (images.length > 0) {
            // Find or link chapter in DB
            const existingManga = db.getMangaById(`${sourceId}:${m.name}`);
            if (existingManga) {
              const chapters = db.getChapters(existingManga.id);
              const matchedCh = chapters.find(c => this.sanitizeName(c.title) === ch.name || ch.name.includes(String(c.chapterNumber)));
              if (matchedCh && !matchedCh.isDownloaded) {
                db.updateChapterDownloadStatus(matchedCh.id, true, chDir);
                registeredCount++;
              }
            }
          }
        }
      }
    }

    return registeredCount;
  }
}

export const downloadManager = new DownloadManager();
