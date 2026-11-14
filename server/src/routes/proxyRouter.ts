import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { coverManager } from '../services/CoverManager.js';

export const proxyRouter = Router();

// Stream remote images with headers, caching and magic byte validation
proxyRouter.get('/proxy/image', async (req, res) => {
  const imageUrl = req.query.url as string;
  const referer = req.query.referer as string || '';

  if (!imageUrl) {
    return res.status(400).send('URL da imagem ausente');
  }

  try {
    const { filePath, contentType, isCached } = await coverManager.getOrFetchCover(imageUrl, referer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // Cache for 7 days
    res.setHeader('X-Cover-Cached', isCached ? 'true' : 'false');

    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    res.status(502).send(`Falha ao carregar imagem: ${err.message}`);
  }
});

// Stream local image file
proxyRouter.get('/proxy/local-file', (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo não encontrado');
  }

  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'image/jpeg';
  if (ext === '.png') contentType = 'image/png';
  else if (ext === '.webp') contentType = 'image/webp';
  else if (ext === '.gif') contentType = 'image/gif';
  else if (ext === '.avif') contentType = 'image/avif';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  fs.createReadStream(filePath).pipe(res);
});

// Stream image inside CBZ / ZIP
proxyRouter.get('/proxy/local-archive-page', (req, res) => {
  const archivePath = req.query.archivePath as string;
  const entryName = req.query.entryName as string;

  if (!archivePath || !entryName || !fs.existsSync(archivePath)) {
    return res.status(404).send('Arquivo zip/cbz não encontrado');
  }

  try {
    const zip = new AdmZip(archivePath);
    const entry = zip.getEntry(entryName);
    if (!entry) {
      return res.status(404).send('Página não encontrada dentro do arquivo compactado');
    }

    const data = zip.readFile(entry);
    if (!data) {
      return res.status(500).send('Erro ao ler página');
    }

    const ext = path.extname(entryName).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.avif') contentType = 'image/avif';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(data);
  } catch (err: any) {
    res.status(500).send(`Erro ao extrair imagem do CBZ/ZIP: ${err.message}`);
  }
});
