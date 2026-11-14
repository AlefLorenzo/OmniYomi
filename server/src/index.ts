import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from './db/database.js';
import { setupWebSocket } from './websocket.js';
import { sourcesRouter } from './routes/sourcesRouter.js';
import { extensionsRouter } from './routes/extensionsRouter.js';
import { mangaRouter } from './routes/mangaRouter.js';
import { chaptersRouter } from './routes/chaptersRouter.js';
import { downloadsRouter } from './routes/downloadsRouter.js';
import { libraryRouter } from './routes/libraryRouter.js';
import { historyRouter } from './routes/historyRouter.js';
import { settingsRouter } from './routes/settingsRouter.js';
import { updatesRouter } from './routes/updatesRouter.js';
import { proxyRouter } from './routes/proxyRouter.js';
import { suwayomiService } from './services/SuwayomiService.js';
import { extensionManager } from './sources/ExtensionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    version: '1.0.0',
    app: 'OmniYomi Manga & Manhwa Platform',
    timestamp: Date.now(),
  });
});

// Mount API routes
app.use('/api/sources', sourcesRouter);
app.use('/api/extensions', extensionsRouter);
app.use('/api/manga', mangaRouter);
app.use('/api/chapters', chaptersRouter);
app.use('/api/downloads', downloadsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/history', historyRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/updates', updatesRouter);
app.use('/api', proxyRouter);

// Serve built frontend assets if present
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Setup WebSocket server
setupWebSocket(server);

// Start listening
const settings = db.getSettings();
const PORT = process.env.PORT || settings.port || 4567;

server.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`  OmniYomi Server executando com sucesso!`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`====================================================`);

  // Inicializar o runtime de extensões Tachiyomi Suwayomi
  suwayomiService.ensureRunning().then(async (ok) => {
    if (ok) {
      console.log('[Motor Tachiyomi] Suwayomi DEX runtime conectado com sucesso!');
      await extensionManager.syncSuwayomiExtensions();
    }
  });
});
