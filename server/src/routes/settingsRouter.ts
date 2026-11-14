import { Router } from 'express';
import { db } from '../db/database.js';
import { libraryManager } from '../services/LibraryManager.js';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  const settings = db.getSettings();
  res.json(settings);
});

settingsRouter.put('/', (req, res) => {
  const updated = db.updateSettings(req.body);
  libraryManager.scheduleUpdates();
  res.json(updated);
});
