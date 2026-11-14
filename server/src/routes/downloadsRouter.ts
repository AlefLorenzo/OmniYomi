import { Router } from 'express';
import { db } from '../db/database.js';
import { downloadManager } from '../services/DownloadManager.js';

export const downloadsRouter = Router();

downloadsRouter.get('/', (req, res) => {
  const queue = db.getDownloads();
  res.json(queue);
});

downloadsRouter.get('/storage', (req, res) => {
  const usage = downloadManager.getStorageUsage();
  res.json(usage);
});

downloadsRouter.post('/enqueue', async (req, res) => {
  const { chapterId } = req.body;
  if (!chapterId) {
    return res.status(400).json({ error: 'chapterId é obrigatório' });
  }

  const chapter = db.getChapterById(chapterId);
  if (!chapter) {
    return res.status(404).json({ error: 'Capítulo não encontrado' });
  }

  const manga = db.getMangaById(chapter.mangaId);
  const mangaTitle = manga?.title || 'Sem Título';
  const coverUrl = manga?.coverUrl || '';

  try {
    const item = await downloadManager.enqueue(chapter, mangaTitle, coverUrl);
    res.json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

downloadsRouter.post('/enqueue-batch', async (req, res) => {
  const { chapterIds } = req.body;
  if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
    return res.status(400).json({ error: 'Array chapterIds é obrigatório' });
  }

  let enqueuedCount = 0;
  for (const id of chapterIds) {
    const chapter = db.getChapterById(id);
    if (chapter) {
      const manga = db.getMangaById(chapter.mangaId);
      const mangaTitle = manga?.title || 'Sem Título';
      const coverUrl = manga?.coverUrl || '';
      try {
        await downloadManager.enqueue(chapter, mangaTitle, coverUrl);
        enqueuedCount++;
      } catch {
        // Skip duplicates or already downloaded
      }
    }
  }

  res.json({ success: true, enqueuedCount });
});

downloadsRouter.post('/pause', (req, res) => {
  downloadManager.pause();
  res.json({ success: true, status: 'PAUSED' });
});

downloadsRouter.post('/resume', (req, res) => {
  downloadManager.resume();
  res.json({ success: true, status: 'RESUMED' });
});

downloadsRouter.delete('/:chapterId', async (req, res) => {
  const { chapterId } = req.params;
  const { deleteFiles } = req.query;

  downloadManager.cancel(chapterId);

  if (deleteFiles === 'true') {
    await downloadManager.deleteDownloadedChapter(chapterId);
  }

  res.json({ success: true, chapterId });
});

downloadsRouter.post('/clear-completed', (req, res) => {
  downloadManager.clearCompleted();
  res.json({ success: true });
});

downloadsRouter.post('/scan-local', (req, res) => {
  const imported = downloadManager.scanAndRegisterExistingDownloads();
  res.json({ success: true, importedCount: imported });
});
