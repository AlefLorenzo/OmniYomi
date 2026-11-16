import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
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
import { downloadManager } from './services/DownloadManager.js';
import { libraryManager } from './services/LibraryManager.js';

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
const webSocketServer = setupWebSocket(server);

// Start/stop lifecycle is explicit so the desktop launcher can manage the backend.
const settings = db.getSettings();
const PORT = Number(process.env.PORT || settings.port || 4567);
const HOST = process.env.HOST || (process.env.OMNIYOMI_DESKTOP === '1' ? '127.0.0.1' : '0.0.0.0');
let shuttingDown = false;

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(PORT, HOST, () => {
      server.off('error', onError);
      console.log('====================================================');
      console.log('  OmniYomi Server executando com sucesso!');
      console.log('  URL: http://127.0.0.1:' + PORT);
      console.log('  WebSocket: ws://127.0.0.1:' + PORT + '/ws');
      console.log('====================================================');

      if (process.env.OMNIYOMI_DISABLE_SUWAYOMI !== '1') {
        suwayomiService.ensureRunning().then(async (ok) => {
          if (ok) {
            console.log('[Motor Tachiyomi] Suwayomi DEX runtime conectado com sucesso!');
            await extensionManager.syncSuwayomiExtensions();
          }
        }).catch((error) => console.warn('[Motor Tachiyomi] Runtime opcional indisponível:', error?.message || error));
      }
      resolve();
    });
  });
}

async function shutdownServer(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[OmniYomi] Encerramento seguro solicitado.');

  libraryManager.stop();
  const downloadsDrained = await downloadManager.shutdown();
  await suwayomiService.stop();

  for (const socket of webSocketServer.clients) {
    try { socket.terminate(); } catch { /* ignore closed sockets */ }
  }
  try { webSocketServer.close(); } catch { /* already closed */ }

  if (server.listening) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (downloadsDrained) {
    try {
      db.close();
      console.log('[OmniYomi] Banco SQLite sincronizado e fechado.');
    } catch (error: any) {
      console.error('[OmniYomi] Falha ao fechar o banco SQLite:', error?.message || error);
      throw error;
    }
  } else {
    console.error('[OmniYomi] Ainda há downloads ativos; o processo encerrará e o SQLite recuperará o WAL na próxima inicialização.');
  }
}

process.once('SIGTERM', () => {
  void shutdownServer().then(() => process.exit(0)).catch((error) => {
    console.error('[OmniYomi] Falha no encerramento:', error);
    process.exit(1);
  });
});
process.once('SIGINT', () => {
  void shutdownServer().then(() => process.exit(0)).catch((error) => {
    console.error('[OmniYomi] Falha no encerramento:', error);
    process.exit(1);
  });
});

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectExecution = Boolean(entryPath) && pathToFileURL(entryPath).href === import.meta.url;
if (isDirectExecution) {
  startServer().catch((error) => {
    console.error('[OmniYomi] Não foi possível iniciar o servidor:', error);
    process.exitCode = 1;
  });
}
