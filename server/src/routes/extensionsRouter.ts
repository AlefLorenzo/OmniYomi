import { Router } from 'express';
import { extensionManager } from '../sources/ExtensionManager.js';
import { repoManager } from '../services/RepoManager.js';
import { db } from '../db/database.js';
import { suwayomiService } from '../services/SuwayomiService.js';

export const extensionsRouter = Router();

// --- Built-in & JS Extensions ---
extensionsRouter.get('/available', async (req, res) => {
  try {
    const list = await extensionManager.getAvailableExtensions();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

extensionsRouter.post('/install', (req, res) => {
  const { id, code } = req.body;
  if (!id || !code) {
    return res.status(400).json({ error: 'Parâmetros "id" e "code" são obrigatórios' });
  }

  try {
    const instance = extensionManager.installExtensionFromCode(id, code);
    res.json({ success: true, manifest: instance.getManifest() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

extensionsRouter.delete('/:id', (req, res) => {
  const { id } = req.params;
  try {
    extensionManager.uninstallExtension(id);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Tachiyomi / Mihon Repository Management ---
extensionsRouter.get('/repos', (req, res) => {
  const repos = db.getExtensionRepos();
  res.json(repos);
});

extensionsRouter.post('/repos', async (req, res) => {
  const { url, name } = req.body;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'URL do repositório é obrigatória' });
  }

  try {
    // Test fetching repo index first to validate
    await repoManager.fetchRepoExtensions(url.trim());
    const repo = db.addExtensionRepo(url.trim(), name);
    res.json({ success: true, repo });
  } catch (err: any) {
    res.status(400).json({ error: `Não foi possível extrair o repositório: ${err.message}` });
  }
});

extensionsRouter.delete('/repos', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL é obrigatória' });
  db.deleteExtensionRepo(url);
  res.json({ success: true, url });
});

extensionsRouter.post('/repos/toggle', (req, res) => {
  const { url, enabled } = req.body;
  db.toggleExtensionRepo(url, Boolean(enabled));
  res.json({ success: true, url, enabled: Boolean(enabled) });
});

// --- Repository Extensions Store (all enabled compatible repositories) ---
extensionsRouter.get('/store', async (req, res) => {
  const query = req.query.q as string | undefined;
  const lang = req.query.lang as string | undefined;
  const repo = req.query.repo as string | undefined;

  try {
    const extensions = await repoManager.getAllExtensions(query, lang, repo);
    res.json({
      total: extensions.length,
      extensions,
      repositories: db.getExtensionRepos().filter((entry: any) => entry.enabled).length,
      compatible: extensions.filter((entry) => entry.isCompatible !== false).length,
      installed: extensions.filter((entry) => entry.isInstalled).length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Refresh enabled repositories and mirror them into the Mihon-compatible runtime.
extensionsRouter.post('/sync', async (req, res) => {
  try {
    const repos = db.getExtensionRepos().filter((entry: any) => entry.enabled);
    const extensions = await repoManager.getAllExtensions();
    const runtimeReady = await suwayomiService.ensureRunning();
    if (runtimeReady) await suwayomiService.syncExtensionStores(repos.map((entry: any) => entry.url));
    res.json({
      success: true,
      repositories: repos.length,
      extensions: extensions.length,
      installed: extensions.filter((entry) => entry.isInstalled).length,
      compatible: extensions.filter((entry) => entry.isCompatible !== false).length,
      runtimeReady,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Download & Extract APK Extension ---
extensionsRouter.post('/extract', async (req, res) => {
  const { pkg, apkUrl, repoUrl } = req.body;
  if (!pkg || !apkUrl) {
    return res.status(400).json({ error: 'pkg e apkUrl são obrigatórios' });
  }

  try {
    const result = await repoManager.extractApkExtension(pkg, apkUrl, repoUrl || '');
    res.json({ success: true, extension: result });
  } catch (err: any) {
    res.status(500).json({ error: `Falha ao extrair extensão: ${err.message}` });
  }
});

// --- Uninstall Extracted APK Extension ---
extensionsRouter.delete('/extracted/:pkg', async (req, res) => {
  const { pkg } = req.params;
  try {
    await repoManager.uninstallExtractedExtension(pkg);
    res.json({ success: true, pkg });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- List Extracted Extensions ---
extensionsRouter.get('/extracted', (req, res) => {
  const list = db.getExtractedExtensions();
  res.json(list);
});
