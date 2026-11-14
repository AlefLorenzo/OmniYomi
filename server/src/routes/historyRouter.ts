import { Router } from 'express';
import { db } from '../db/database.js';

export const historyRouter = Router();

historyRouter.get('/', (req, res) => {
  const limit = parseInt(req.query.limit as string || '50', 10);
  const history = db.getReadingHistory(limit);
  res.json(history);
});

historyRouter.delete('/', (req, res) => {
  db.clearHistory();
  res.json({ success: true });
});
