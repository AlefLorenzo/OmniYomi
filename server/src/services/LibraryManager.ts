import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
import { Manga, Chapter } from '../types/index.js';
import { EventEmitter } from 'events';
import { parseMangaId } from '../utils/idHelper.js';

export class LibraryManager extends EventEmitter {
  private updateTimer: NodeJS.Timeout | null = null;
  private isUpdating = false;

  constructor() {
    super();
    this.scheduleUpdates();
  }

  public scheduleUpdates() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    const settings = db.getSettings();
    const intervalMinutes = Math.max(15, settings.autoUpdateIntervalMinutes || 60);

    this.updateTimer = setInterval(() => {
      this.checkLibraryUpdates().catch(e => console.error('Erro na verificação automática de updates:', e.message));
    }, intervalMinutes * 60 * 1000);
    if (this.updateTimer?.unref) {
      this.updateTimer.unref();
    }
  }

  public stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  public async addToLibrary(mangaId: string, categoryId: string = 'default'): Promise<Manga> {
    const existing = db.getMangaById(mangaId);
    if (!existing) {
      throw new Error(`Mangá ${mangaId} não encontrado no banco local.`);
    }

    db.setMangaInLibrary(mangaId, true, categoryId);

    // Refresh chapter list
    await this.refreshMangaChapters(mangaId);

    const updated = db.getMangaById(mangaId)!;
    this.emit('library_updated', updated);
    return updated;
  }

  public removeFromLibrary(mangaId: string): boolean {
    const success = db.setMangaInLibrary(mangaId, false);
    if (success) {
      this.emit('library_updated', { id: mangaId, inLibrary: false });
    }
    return success;
  }

  public setCategory(mangaId: string, categoryId: string): boolean {
    return db.setMangaInLibrary(mangaId, true, categoryId);
  }

  public async refreshMangaChapters(mangaId: string): Promise<Chapter[]> {
    let manga = db.getMangaById(mangaId);
    if (!manga) {
      const { sourceId, sourceMangaId } = parseMangaId(mangaId);
      if (sourceId && sourceMangaId) {
        const source = extensionManager.getSource(sourceId);
        if (source) {
          try {
            const details = await source.getMangaDetails(sourceMangaId);
            manga = db.saveOrUpdateManga({
              id: mangaId,
              sourceId,
              sourceMangaId,
              title: details.title || 'Sem título',
              ...details,
            });
          } catch (e: any) {
            console.warn(`[LibraryManager] Falha ao obter detalhes do mangá ${mangaId}:`, e.message);
          }
        }
      }
    }
    if (!manga) throw new Error('Mangá não encontrado');

    const source = extensionManager.getSource(manga.sourceId);
    if (!source) throw new Error(`Fonte ${manga.sourceId} não instalada`);

    const chapters = await source.getChapterList(manga.sourceMangaId);
    if (chapters && chapters.length > 0) {
      db.saveChapters(chapters);
    }

    return db.getChapters(mangaId);
  }

  public async checkLibraryUpdates(): Promise<{ updatedManga: { manga: Manga; newChaptersCount: number }[] }> {
    if (this.isUpdating) {
      return { updatedManga: [] };
    }

    this.isUpdating = true;
    const results: { manga: Manga; newChaptersCount: number }[] = [];

    try {
      const libraryManga = db.getLibraryManga();

      for (const item of libraryManga) {
        try {
          const source = extensionManager.getSource(item.sourceId);
          if (!source) continue;

          const oldChapters = db.getChapters(item.id);
          const oldChapterIds = new Set(oldChapters.map(c => c.id));

          const latestChapters = await source.getChapterList(item.sourceMangaId);
          const newOnes = latestChapters.filter(c => !oldChapterIds.has(c.id));

          if (newOnes.length > 0) {
            db.saveChapters(latestChapters);
            const fresh = db.getMangaById(item.id)!;
            results.push({ manga: fresh, newChaptersCount: newOnes.length });
          }

          // Polite delay between sources to avoid rate-limiting
          await new Promise(r => setTimeout(r, 600));
        } catch (e: any) {
          console.warn(`Erro ao checar atualizações para ${item.title}:`, e.message);
        }
      }

      this.emit('updates_checked', results);
      return { updatedManga: results };
    } finally {
      this.isUpdating = false;
    }
  }
}

export const libraryManager = new LibraryManager();
