#!/usr/bin/env node
/**
 * OmniYomi APK Server
 * Serve o APK para download direto pelo celular via Wi-Fi local.
 * Uso: node scripts/serve-apk.js
 *      node scripts/serve-apk.js --download   (baixa automaticamente do GitHub Releases)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APK_DIR = path.join(ROOT, 'apk');
const PORT = 8888;
const GITHUB_OWNER = 'AlefLorenzo';
const GITHUB_REPO = 'OmniYomi';

// ── Utilitários ─────────────────────────────────────────────────────────────

function getLocalIPs() {
  const nets = networkInterfaces();
  const results = [];
  for (const iface of Object.values(nets)) {
    for (const net of (iface || [])) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function findLocalApks() {
  if (!fs.existsSync(APK_DIR)) return [];
  return fs.readdirSync(APK_DIR)
    .filter(f => f.endsWith('.apk'))
    .map(f => {
      const stat = fs.statSync(path.join(APK_DIR, f));
      return { name: f, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OmniYomi-APK-Server/1.0', 'Accept': 'application/vnd.github.v3+json' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (u) => {
      https.get(u, { headers: { 'User-Agent': 'OmniYomi-APK-Server/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location);
        }
        const total = parseInt(res.headers['content-length'] || '0');
        let downloaded = 0;
        res.on('data', chunk => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = ((downloaded / total) * 100).toFixed(0);
            process.stdout.write(`\r  Baixando... ${pct}% (${formatSize(downloaded)} / ${formatSize(total)})`);
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log(''); resolve(); });
      }).on('error', reject);
    };
    request(url);
    file.on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

async function downloadLatestRelease() {
  console.log(`\nBuscando última release em github.com/${GITHUB_OWNER}/${GITHUB_REPO}...`);
  const { status, body } = await httpsGet(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
  if (status !== 200) {
    console.error(`  Erro ao buscar release: HTTP ${status}`);
    return null;
  }
  const release = JSON.parse(body);
  const apkAsset = (release.assets || []).find(a => a.name.endsWith('.apk'));
  if (!apkAsset) {
    console.log(`  Nenhum APK encontrado na release ${release.tag_name}.`);
    console.log(`  Acesse: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`);
    return null;
  }
  if (!fs.existsSync(APK_DIR)) fs.mkdirSync(APK_DIR, { recursive: true });
  const dest = path.join(APK_DIR, apkAsset.name);
  if (fs.existsSync(dest)) {
    console.log(`  Arquivo já existe: ${apkAsset.name}`);
    return dest;
  }
  console.log(`  Baixando: ${apkAsset.name} (${formatSize(apkAsset.size)})...`);
  await downloadFile(apkAsset.browser_download_url, dest);
  console.log(`  Salvo em: ${dest}`);
  return dest;
}

// ── HTML da página de download ───────────────────────────────────────────────

function buildHtml(apks, ips) {
  const apkItems = apks.length === 0
    ? `<div class="empty">
        <p>⚠️ Nenhum APK encontrado na pasta <code>/apk</code>.</p>
        <p>Execute com a flag <code>--download</code> para baixar automaticamente do GitHub:</p>
        <pre>node scripts/serve-apk.js --download</pre>
        <p>Ou baixe manualmente em:</p>
        <a class="btn" href="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases" target="_blank">
          Ver Releases no GitHub
        </a>
       </div>`
    : apks.map(apk => `
        <div class="apk-card">
          <div class="apk-info">
            <span class="apk-icon">📦</span>
            <div>
              <strong>${apk.name}</strong>
              <span class="apk-size">${formatSize(apk.size)}</span>
            </div>
          </div>
          <a class="btn" href="/download/${encodeURIComponent(apk.name)}">
            ⬇️ Baixar
          </a>
        </div>`).join('');

  const ipLinks = ips.map(ip =>
    `<a href="http://${ip}:${PORT}" class="ip-link">http://${ip}:${PORT}</a>`
  ).join('<br>');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniYomi — Instalar APK</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f1117; color: #e2e8f0; font-family: system-ui, sans-serif;
           min-height: 100vh; padding: 24px 16px; }
    .container { max-width: 480px; margin: 0 auto; }
    .header { text-align: center; padding: 32px 0 24px; }
    .logo { width: 72px; height: 72px; background: linear-gradient(135deg, #7c3aed, #4f46e5);
            border-radius: 20px; display: flex; align-items: center; justify-content: center;
            font-size: 36px; margin: 0 auto 16px; box-shadow: 0 8px 32px #7c3aed40; }
    h1 { font-size: 26px; font-weight: 700; color: #fff; }
    .subtitle { color: #94a3b8; margin-top: 6px; font-size: 14px; }
    .section { background: #161b27; border: 1px solid #1e293b; border-radius: 16px;
               padding: 20px; margin-bottom: 16px; }
    .section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
                  color: #64748b; margin-bottom: 14px; }
    .ip-link { display: block; color: #a78bfa; font-size: 15px; word-break: break-all;
               text-decoration: none; }
    .ip-link:hover { text-decoration: underline; }
    .apk-card { display: flex; align-items: center; justify-content: space-between;
                gap: 12px; padding: 12px 0; border-bottom: 1px solid #1e293b; }
    .apk-card:last-child { border-bottom: none; padding-bottom: 0; }
    .apk-info { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .apk-icon { font-size: 28px; flex-shrink: 0; }
    .apk-info strong { display: block; font-size: 14px; color: #e2e8f0;
                       word-break: break-all; }
    .apk-size { font-size: 12px; color: #64748b; }
    .btn { background: #7c3aed; color: #fff; border: none; padding: 10px 18px;
           border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
           text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
           flex-shrink: 0; transition: background .15s; }
    .btn:hover { background: #6d28d9; }
    .steps { list-style: none; }
    .steps li { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0;
                font-size: 14px; color: #cbd5e1; }
    .steps li span { background: #7c3aed; color: #fff; width: 22px; height: 22px; border-radius: 50%;
                     font-size: 12px; font-weight: 700; display: flex; align-items: center;
                     justify-content: center; flex-shrink: 0; margin-top: 1px; }
    .empty { text-align: center; color: #64748b; padding: 16px 0; }
    .empty code, .empty pre { background: #0d1117; padding: 4px 8px; border-radius: 6px;
                              font-size: 13px; color: #a78bfa; }
    .empty pre { margin: 8px 0; padding: 12px; display: inline-block; }
    .empty p { margin: 8px 0; }
    .github-link { text-align: center; padding-top: 8px; }
    .github-link a { color: #64748b; font-size: 13px; text-decoration: none; }
    .github-link a:hover { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">📚</div>
      <h1>OmniYomi</h1>
      <p class="subtitle">Leitor de Mangás, Manhwas e Manhuas</p>
    </div>

    <div class="section">
      <h2>Endereço desta página</h2>
      ${ipLinks || '<span style="color:#64748b">Nenhuma rede encontrada</span>'}
    </div>

    <div class="section" style="border: 1px solid #7c3aed60; background: #1a162b;">
      <h2 style="color: #c084fc;">⚡ Usar no Celular sem Reinstalar</h2>
      <p style="font-size: 13px; color: #cbd5e1; margin-bottom: 12px;">
        Acesse o OmniYomi com todas as fontes, extensões e correções mais recentes direto pelo navegador do celular:
      </p>
      <a class="btn" href="/app" style="background: linear-gradient(135deg, #9333ea, #6366f1); width: 100%; justify-content: center; padding: 12px;">
        🚀 Abrir OmniYomi Atualizado no Navegador
      </a>
    </div>

    <div class="section">
      <h2>Download do APK</h2>
      ${apkItems}
    </div>

    <div class="section">
      <h2>Como instalar</h2>
      <ol class="steps">
        <li><span>1</span>Clique em "Baixar" acima para fazer o download do APK.</li>
        <li><span>2</span>Abra o arquivo <code>.apk</code> no seu celular Android.</li>
        <li><span>3</span>Se pedido, toque em <strong>"Permitir desta fonte"</strong> ou habilite <em>Instalar apps desconhecidos</em> nas Configurações.</li>
        <li><span>4</span>Toque em <strong>Instalar</strong> e aguarde concluir.</li>
      </ol>
    </div>

    <div class="github-link">
      <a href="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases" target="_blank">
        Ver todas as versões no GitHub →
      </a>
    </div>
  </div>
</body>
</html>`;
}

// ── Servidor HTTP ────────────────────────────────────────────────────────────

function startServer() {
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Proxy /api requests to OmniYomi backend on port 4567
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port: 4567,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: '127.0.0.1:4567',
          },
        },
        proxyRes => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', err => {
        console.warn(`[Proxy Error] ${req.url} -> :4567 failed:`, err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Backend offline ou iniciando: ${err.message}` }));
      });

      req.pipe(proxyReq);
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const apks = findLocalApks();
      const ips = getLocalIPs();
      const html = buildHtml(apks, ips);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Servir aplicativo web SPA do cliente em /app (para usar direto sem precisar reinstalar APK)
    if (url.pathname.startsWith('/app') || url.pathname.startsWith('/assets/')) {
      const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
      let reqPath = url.pathname;
      if (reqPath.startsWith('/app')) {
        reqPath = reqPath.replace(/^\/app/, '');
      }
      if (!reqPath || reqPath === '/') reqPath = '/index.html';

      let filePath = path.join(CLIENT_DIST, reqPath);
      // Se não achar o arquivo específico, serve index.html (SPA routing)
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(CLIENT_DIST, 'index.html');
      }

      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    if (url.pathname.startsWith('/download/')) {
      const fileName = decodeURIComponent(url.pathname.replace('/download/', ''));
      const filePath = path.join(APK_DIR, path.basename(fileName));

      if (!filePath.startsWith(APK_DIR) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('APK não encontrado.');
        return;
      }

      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
        'Content-Length': stat.size,
      });
      fs.createReadStream(filePath).pipe(res);
      console.log(`[download] ${path.basename(filePath)} (${formatSize(stat.size)})`);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Não encontrado.');
  });

  // WebSocket reverse proxy to port 4567
  server.on('upgrade', (req, socket, head) => {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: 4567,
      path: req.url,
      method: req.method,
      headers: req.headers,
    });

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      socket.write(
        `HTTP/${req.httpVersion} 101 Switching Protocols\r\n` +
          Object.entries(proxyRes.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n'
      );
      if (proxyHead && proxyHead.length) socket.write(proxyHead);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });

    proxyReq.on('error', () => {
      socket.destroy();
    });

    proxyReq.end();
  });

  server.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalIPs();
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║      OmniYomi APK Server — Pronto!       ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('\nAbra no celular (mesma rede Wi-Fi):');
    ips.forEach(ip => console.log(`  → http://${ip}:${PORT}`));
    if (ips.length === 0) console.log(`  → http://localhost:${PORT}`);
    console.log('\nPressione Ctrl+C para encerrar.\n');
  });
}

// ── Entry Point ──────────────────────────────────────────────────────────────

const shouldDownload = process.argv.includes('--download');

if (shouldDownload) {
  downloadLatestRelease()
    .then(() => startServer())
    .catch(err => {
      console.error('Erro ao baixar release:', err.message);
      startServer();
    });
} else {
  startServer();
}
