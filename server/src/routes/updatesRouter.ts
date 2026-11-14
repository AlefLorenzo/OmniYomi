import { Router } from 'express';
import { libraryManager } from '../services/LibraryManager.js';

export const updatesRouter = Router();

updatesRouter.post('/check', async (req, res) => {
  try {
    const result = await libraryManager.checkLibraryUpdates();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
