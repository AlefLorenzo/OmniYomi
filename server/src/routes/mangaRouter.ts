import { Router } from 'express';
import { db } from '../db/database.js';
import { extensionManager } from '../sources/ExtensionManager.js';
import { libraryManager } from '../services/LibraryManager.js';

export const mangaRouter = Router();

mangaRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  let manga = db.getMangaById(id);

  if (!manga) {
    // If not in local DB, extract sourceId and sourceMangaId
    const parts = id.split(':');
    if (parts.length >= 2) {
      const sourceId = parts[0];
      const sourceMangaId = parts.slice(1).join(':');
      const source = extensionManager.getSource(sourceId);

      if (source) {
        try {
          const details = await source.getMangaDetails(sourceMangaId);
          manga = db.saveOrUpdateManga({
            id,
            sourceId,
            sourceMangaId,
            title: details.title || 'Sem título',
            ...details,
          });
        } catch (e: any) {
          return res.status(500).json({ error: `Erro ao obter detalhes da fonte: ${e.message}` });
        }
      }
    }
  }

  if (!manga) {
    return res.status(404).json({ error: 'Mangá não encontrado' });
  }

  res.json(manga);
});

mangaRouter.get('/:id/chapters', async (req, res) => {
  const { id } = req.params;
  let chapters = db.getChapters(id);

  // If no chapters in db yet, fetch from source
  if (chapters.length === 0) {
    try {
      chapters = await libraryManager.refreshMangaChapters(id);
    } catch (e: any) {
      console.warn(`Aviso ao buscar capítulos de ${id}:`, e.message);
    }
  }

  res.json(chapters);
});

mangaRouter.post('/:id/refresh', async (req, res) => {
  const { id } = req.params;
  try {
    const chapters = await libraryManager.refreshMangaChapters(id);
    const manga = db.getMangaById(id);
    res.json({ success: true, manga, chaptersCount: chapters.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

mangaRouter.post('/:id/library', async (req, res) => {
  const { id } = req.params;
  const { inLibrary, categoryId } = req.body;

  try {
    if (inLibrary) {
      // Ensure manga exists in DB before adding to library
      let manga = db.getMangaById(id);
      if (!manga) {
        const parts = id.split(':');
        const sourceId = parts[0];
        const sourceMangaId = parts.slice(1).join(':');
        const source = extensionManager.getSource(sourceId);
        if (source) {
          const details = await source.getMangaDetails(sourceMangaId);
          db.saveOrUpdateManga({
            id,
            sourceId,
            sourceMangaId,
            title: details.title || 'Sem título',
            ...details,
          });
        }
      }

      const updated = await libraryManager.addToLibrary(id, categoryId || 'default');
      res.json(updated);
    } else {
      libraryManager.removeFromLibrary(id);
      res.json({ success: true, inLibrary: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

mangaRouter.put('/:id/category', (req, res) => {
  const { id } = req.params;
  const { categoryId } = req.body;
  const ok = libraryManager.setCategory(id, categoryId);
  res.json({ success: ok, categoryId });
});
