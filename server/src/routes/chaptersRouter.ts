import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
import { PageImage } from '../types/index.js';

export const chaptersRouter = Router();

chaptersRouter.get('/:id/pages', async (req, res) => {
  const { id } = req.params;
  const chapter = db.getChapterById(id);

  // 1. Check if chapter is downloaded locally
  if (chapter?.isDownloaded && chapter.downloadedPath && fs.existsSync(chapter.downloadedPath)) {
    try {
      const dir = chapter.downloadedPath;
      const files = fs.readdirSync(dir)
        .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      if (files.length > 0) {
        const pages: PageImage[] = files.map((file, idx) => {
          const filePath = path.join(dir, file);
          return {
            index: idx + 1,
            url: `/api/proxy/local-file?path=${encodeURIComponent(filePath)}`,
            localPath: filePath,
          };
        });

        return res.json({
          chapterId: id,
          isOffline: true,
          totalPages: pages.length,
          pages,
        });
      }
    } catch (e: any) {
      console.warn(`Erro ao ler arquivos locais do capítulo ${id}:`, e.message);
    }
  }

  // 2. Fetch pages online from source
  const parts = id.split(':');
  if (parts.length < 3) {
    return res.status(400).json({ error: 'Formato inválido de ID de capítulo' });
  }

  const sourceId = parts[0];
  const sourceChapterId = parts[2];
  const source = extensionManager.getSource(sourceId);

  if (!source) {
    return res.status(404).json({ error: `Fonte "${sourceId}" não encontrada` });
  }

  try {
    const rawPages = await source.getPageList(sourceChapterId, chapter?.url || undefined);
    const pages: PageImage[] = rawPages.map((p, idx) => {
      // Route through local image proxy to prevent CORS and referer blocks
      const referer = p.headers?.Referer || source.baseUrl;
      const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(p.url)}&referer=${encodeURIComponent(referer)}`;

      return {
        index: p.index || idx + 1,
        url: proxyUrl,
        headers: p.headers,
      };
    });

    res.json({
      chapterId: id,
      isOffline: false,
      totalPages: pages.length,
      pages,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao carregar páginas do capítulo' });
  }
});

chaptersRouter.post('/:id/progress', (req, res) => {
  const { id } = req.params;
  const { page, totalPages, isRead } = req.body;

  if (typeof page !== 'number') {
    return res.status(400).json({ error: 'Parâmetro "page" deve ser um número' });
  }

  db.updateChapterProgress(id, page, totalPages || 0, Boolean(isRead));
  res.json({ success: true, chapterId: id, page, isRead: Boolean(isRead) });
});

chaptersRouter.post('/mark-read', (req, res) => {
  const { chapterIds, isRead } = req.body;

  if (!Array.isArray(chapterIds)) {
    return res.status(400).json({ error: '"chapterIds" deve ser um array' });
  }

  db.markChaptersRead(chapterIds, Boolean(isRead));
  res.json({ success: true, count: chapterIds.length, isRead: Boolean(isRead) });
});

