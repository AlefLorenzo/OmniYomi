import { Router } from 'express';
import { extensionManager } from '../sources/ExtensionManager.js';

export const extensionsRouter = Router();

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
