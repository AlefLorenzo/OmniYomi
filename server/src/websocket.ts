import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { downloadManager } from './services/DownloadManager.js';
import { libraryManager } from './services/LibraryManager.js';

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<WebSocket>();

  wss.on('connection', ws => {
    clients.add(ws);

    // Send connection greeting
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Conectado ao servidor OmniYomi' }));

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  const broadcast = (type: string, data: any) => {
    const payload = JSON.stringify({ type, data });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  // Wire DownloadManager events
  downloadManager.on('progress', data => broadcast('DOWNLOAD_PROGRESS', data));
  downloadManager.on('completed', data => broadcast('DOWNLOAD_COMPLETED', data));
  downloadManager.on('error', data => broadcast('DOWNLOAD_ERROR', data));
  downloadManager.on('queue_updated', data => broadcast('DOWNLOAD_QUEUE_UPDATED', data));
  downloadManager.on('paused', () => broadcast('DOWNLOAD_PAUSED', {}));
  downloadManager.on('resumed', () => broadcast('DOWNLOAD_RESUMED', {}));

  // Wire LibraryManager events
  libraryManager.on('library_updated', data => broadcast('LIBRARY_UPDATED', data));
  libraryManager.on('updates_checked', data => broadcast('UPDATES_CHECKED', data));

  return wss;
}
