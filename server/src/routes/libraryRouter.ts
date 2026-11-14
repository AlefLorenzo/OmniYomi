import { Router } from 'express';
import { db } from '../db/database.js';

export const libraryRouter = Router();

libraryRouter.get('/', (req, res) => {
  const categoryId = req.query.category as string | undefined;
  const search = req.query.search as string | undefined;
  const items = db.getLibraryManga(categoryId, search);
  res.json(items);
});

libraryRouter.get('/categories', (req, res) => {
  const cats = db.getCategories();
  res.json(cats);
});

libraryRouter.post('/categories', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
  }

  const cat = db.createCategory(name.trim());
  res.json(cat);
});

libraryRouter.delete('/categories/:id', (req, res) => {
  const { id } = req.params;
  db.deleteCategory(id);
  res.json({ success: true, id });
});
