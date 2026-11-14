import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
import { PageImage } from '../types/index.js';
import { parseChapterId } from '../utils/idHelper.js';

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

  // 2. Safely parse chapter ID into sourceId, mangaId, and sourceChapterId
  const { sourceId, sourceChapterId } = parseChapterId(id);
  if (!sourceId || !sourceChapterId) {
    return res.status(400).json({ error: 'Formato inválido de ID de capítulo' });
  }

  const source = extensionManager.getSource(sourceId);
  if (!source) {
    return res.status(404).json({ error: `Fonte "${sourceId}" não encontrada` });
  }

  try {
    const rawPages = await source.getPageList(sourceChapterId, chapter?.url || undefined);
    const pages: PageImage[] = rawPages.map((p, idx) => {
      let pageUrl = p.url;
      // If image is remote http and needs proxy, format with proxy URL
      if (pageUrl.startsWith('http://') || pageUrl.startsWith('https://')) {
        const refererParam = p.headers?.Referer ? `&referer=${encodeURIComponent(p.headers.Referer)}` : '';
        pageUrl = `/api/proxy/image?url=${encodeURIComponent(p.url)}${refererParam}`;
      }
      return {
        index: p.index || idx + 1,
        url: pageUrl,
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
    res.status(500).json({ error: `Erro ao carregar páginas: ${err.message}` });
  }
});

// Update reading progress
chaptersRouter.post('/:id/progress', (req, res) => {
  const { id } = req.params;
  const { page, totalPages, isRead } = req.body;

  try {
    const chapter = db.getChapterById(id);
    if (!chapter) {
      return res.status(404).json({ error: 'Capítulo não encontrado' });
    }

    db.updateChapterProgress(
      id,
      page || chapter.lastPageRead || 0,
      totalPages || chapter.totalPages || 0,
      Boolean(isRead)
    );

    const updated = db.getChapterById(id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
