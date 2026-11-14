import { Router } from 'express';
import { extensionManager } from '../sources/ExtensionManager.js';
import { db } from '../db/database.js';
import { deduplicationService } from '../services/DeduplicationService.js';
import { flareSolverrService } from '../services/FlareSolverrService.js';

export const sourcesRouter = Router();

sourcesRouter.get('/', (req, res) => {
  const sources = extensionManager.getAllSources();
  res.json(sources);
});

sourcesRouter.post('/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;
  extensionManager.toggleSource(id, Boolean(enabled));
  res.json({ success: true, id, enabled });
});

sourcesRouter.get('/:id/health', async (req, res) => {
  const { id } = req.params;
  const health = await extensionManager.checkSourceHealth(id);
  res.json(health);
});

sourcesRouter.get('/:id/popular', async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page as string || '1', 10);
  const source = extensionManager.getSource(id);

  if (!source) {
    return res.status(404).json({ error: `Fonte "${id}" não encontrada` });
  }

  try {
    const result = await source.getPopular(page);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao buscar catálogo popular' });
  }
});

sourcesRouter.get('/:id/latest', async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page as string || '1', 10);
  const source = extensionManager.getSource(id);

  if (!source) {
    return res.status(404).json({ error: `Fonte "${id}" não encontrada` });
  }

  try {
    const result = await source.getLatest(page);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao buscar atualizações recentes' });
  }
});

sourcesRouter.get('/:id/search', async (req, res) => {
  const { id } = req.params;
  const query = (req.query.q as string || '').trim();
  const page = parseInt(req.query.page as string || '1', 10);
  const source = extensionManager.getSource(id);

  if (!source) {
    return res.status(404).json({ error: `Fonte "${id}" não encontrada` });
  }

  try {
    const result = await source.search(query, page, req.query as any);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao pesquisar na fonte' });
  }
});

// Global search across all active sources
sourcesRouter.get('/search/global', async (req, res) => {
  const query = (req.query.q as string || '').trim();
  if (!query) {
    return res.json({ results: [] });
  }

  const activeSources = extensionManager.getAllSources().filter(s => s.isEnabled);
  const searchPromises = activeSources.map(async s => {
    const live = extensionManager.getSource(s.id);
    if (!live) return { source: s, manga: [], error: 'Fonte inativa' };
    try {
      const searchRes = await live.search(query, 1);
      return { source: s, manga: searchRes.manga };
    } catch (e: any) {
      return { source: s, manga: [], error: e.message };
    }
  });

  const results = await Promise.all(searchPromises);
  res.json({ query, results });
});

// Deduplicated search across sources
sourcesRouter.get('/search/deduplicated', async (req, res) => {
  const query = (req.query.q as string || '').trim();
  if (!query) {
    return res.json({ groups: [] });
  }

  const activeSources = extensionManager.getAllSources().filter(s => s.isEnabled);
  const searchPromises = activeSources.map(async s => {
    const live = extensionManager.getSource(s.id);
    if (!live) return [];
    try {
      const searchRes = await live.search(query, 1);
      return searchRes.manga;
    } catch {
      return [];
    }
  });

  const allMangaArrays = await Promise.all(searchPromises);
  const flattened = allMangaArrays.flat();
  const groups = deduplicationService.groupMangaAcrossSources(flattened);
  res.json({ query, totalSources: activeSources.length, groups });
});

// FlareSolverr status
sourcesRouter.get('/flaresolverr/status', async (req, res) => {
  const status = await flareSolverrService.checkHealth();
  res.json(status);
});
