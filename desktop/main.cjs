const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { ensureSuwayomiRuntime } = require('../scripts/runtime-manager.cjs');
const path = require('path');
const fs = require('fs');
const net = require('net');

const APP_NAME = 'OmniYomi Desktop';
const DEFAULT_PORT = 4567;
let launcherWindow = null;
let appWindow = null;
let backend = null;
let backendOwned = false;
let backendShutdownConfirmed = false;
let serverPort = DEFAULT_PORT;
let serverUrl = null;
let quitting = false;
let allowQuit = false;
let startPromise = null;
let currentStatus = { state: 'stopped', message: 'Servidor desligado', port: null, url: null };
let updateStatus = { state: 'idle', currentVersion: app.getVersion(), version: null, releaseNotes: null, error: null };
let updateCheckInterval = null;
const recentLogs = [];
const MAX_LOG_LINES = 300;

const localRoot = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'OmniYomi');
const dataDir = path.join(localRoot, 'data');
const logsDir = path.join(localRoot, 'logs');
const logFile = path.join(logsDir, 'desktop.log');

function ensureDirectories() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
}

function broadcast(channel, payload) {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.webContents.send('omniyomi:' + channel, payload);
  }
}

function log(level, message) {
  const line = '[' + new Date().toISOString() + '] [' + level + '] ' + String(message);
  recentLogs.push(line);
  if (recentLogs.length > MAX_LOG_LINES) recentLogs.shift();
  try {
    ensureDirectories();
    fs.appendFileSync(logFile, line + '\n', 'utf8');
  } catch { /* logging must not crash the launcher */ }
  broadcast('log', line);
}

function setStatus(state, message, extra = {}) {
  currentStatus = { state, message, port: serverPort, url: serverUrl, ...extra };
  broadcast('status', currentStatus);
  log('STATUS', message);
}

function getAppRoot() {
  return app.getAppPath();
}

function getServerEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'src', 'index.js');
  }
  return path.join(getAppRoot(), 'dist', 'src', 'index.js');
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function reserveFreePort(preferredPort) {
  if (await isPortAvailable(preferredPort)) return preferredPort;
  for (let port = preferredPort + 1; port <= preferredPort + 25; port++) {
    if (await isPortAvailable(port)) return port;
  }
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const selected = address && typeof address === 'object' ? address.port : preferredPort;
      probe.close(() => resolve(selected));
    });
  });
}

async function getHealth(port, timeoutMs = 1200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/api/health', { signal: controller.signal });
    if (!response.ok) return null;
    const json = await response.json();
    if (json && json.status === 'ONLINE' && String(json.app || '').includes('OmniYomi')) return json;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function migrateLegacyData() {
  const legacyRoot = path.join(getAppRoot(), 'data');
  const legacyDb = path.join(legacyRoot, 'omniyomi.db');
  const targetDb = path.join(dataDir, 'omniyomi.db');
  if (app.isPackaged || fs.existsSync(targetDb) || !fs.existsSync(legacyDb)) return false;

  ensureDirectories();
  log('INFO', 'Instalação antiga encontrada. Validando e migrando os dados locais.');
  const Database = require('better-sqlite3');
  const source = new Database(legacyDb, { readonly: true, fileMustExist: true });
  try {
    const integrity = source.pragma('integrity_check');
    if (!Array.isArray(integrity) || integrity[0]?.integrity_check !== 'ok') {
      throw new Error('O banco antigo não passou no integrity_check. O arquivo original foi preservado.');
    }

    const legacyDownloads = path.join(legacyRoot, 'downloads');
    const targetDownloads = path.join(dataDir, 'downloads');
    if (fs.existsSync(legacyDownloads) && !fs.existsSync(targetDownloads)) {
      fs.cpSync(legacyDownloads, targetDownloads, { recursive: true, errorOnExist: true });
    }
    for (const folder of ['extensions', 'local_manga', 'cache']) {
      const from = path.join(legacyRoot, folder);
      const to = path.join(dataDir, folder);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true, errorOnExist: true });
      }
    }

    await source.backup(targetDb);
    const migrated = new Database(targetDb);
    try {
      migrated.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('downloadPath', targetDownloads);
      migrated.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      migrated.close();
    }
    log('INFO', 'Migração dos dados locais concluída. O banco original foi mantido.');
    return true;
  } finally {
    source.close();
  }
}

function attachBackendLogs(child) {
  const consume = (stream, level) => {
    if (!stream) return;
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        if (level === 'SERVER' && line.includes('SHUTDOWN_COMPLETE: SQLite checkpoint')) {
          backendShutdownConfirmed = true;
        }
        log(level, line);
      }
    });
    stream.on('end', () => {
      if (buffer.trim()) log(level, buffer);
    });
  };
  consume(child.stdout, 'SERVER');
  consume(child.stderr, 'SERVER-ERROR');
}

async function waitForServer(child, port, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('O processo do backend encerrou antes de ficar saudável. Consulte os logs.');
    }
    const health = await getHealth(port);
    if (health) return health;
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error('O backend não respondeu ao endpoint /api/health na porta ' + port + ' dentro do limite de inicialização.');
}

async function startBackendInternal() {
  if (backend && backend.exitCode === null) {
    const health = await getHealth(serverPort);
    if (!health) await waitForServer(backend, serverPort, 20000);
    setStatus('online', 'OmniYomi está pronto para uso.');
    if (!process.argv.includes('--smoke-test')) createAppWindow();
    return { success: true, url: serverUrl, adopted: false };
  }

  ensureDirectories();
  setStatus('starting', 'Verificando dados e preparando o ambiente...');
  await migrateLegacyData();

  const existing = await getHealth(DEFAULT_PORT);
  if (existing) {
    backend = null;
    backendOwned = false;
    serverPort = DEFAULT_PORT;
    serverUrl = 'http://127.0.0.1:' + serverPort;
    setStatus('online', 'Uma instância OmniYomi já está em execução. Ela será reutilizada sem ser encerrada por este inicializador.', { adopted: true });
    if (!process.argv.includes('--smoke-test')) createAppWindow();
    return { success: true, url: serverUrl, adopted: true };
  }

  if (process.platform === 'win32' && process.env.OMNIYOMI_SKIP_RUNTIME_SETUP !== '1') {
    try {
      setStatus('starting', 'Verificando o runtime local de extensões Mihon...');
      const runtime = await ensureSuwayomiRuntime({
        dataDir,
        logger: (message) => log('RUNTIME', message),
      });
      if (runtime.home) process.env.SUWAYOMI_HOME = runtime.home;
      log('INFO', runtime.skipped
        ? 'Runtime de extensões já instalado e válido; download ignorado.'
        : 'Runtime de extensões instalado e verificado.');
    } catch (error) {
      // O catálogo MangaDex e a biblioteca local permanecem disponíveis sem o runtime APK.
      log('WARN', 'Não foi possível preparar o runtime de extensões: ' + (error?.message || error));
      log('WARN', 'As extensões Tachiyomi/Mihon ficarão indisponíveis até concluir a instalação do runtime.');
    }
  }

  serverPort = await reserveFreePort(DEFAULT_PORT);
  serverUrl = 'http://127.0.0.1:' + serverPort;
  const entry = getServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error('Backend compilado não encontrado. Execute o build de produção antes de iniciar o OmniYomi Desktop.');
  }

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PORT: String(serverPort),
    HOST: '127.0.0.1',
    OMNIYOMI_DESKTOP: '1',
    OMNIYOMI_DATA_DIR: dataDir,
    SUWAYOMI_HOME: process.env.SUWAYOMI_HOME || process.env.OMNIYOMI_SUWAYOMI_HOME || path.join(dataDir, 'runtime', 'suwayomi')
  };

  // app.getAppPath() aponta para app.asar na versão empacotada. O ASAR é
  // um arquivo virtual, não um diretório físico aceito como cwd por CreateProcess.
  // Use a pasta resources real para que o processo filho possa iniciar também
  // quando o app é executado pelo instalador NSIS ou pelo pacote portátil.
  const backendCwd = app.isPackaged ? process.resourcesPath : getAppRoot();
  if (!fs.existsSync(backendCwd) || !fs.statSync(backendCwd).isDirectory()) {
    throw new Error('Diretório físico do backend não encontrado: ' + backendCwd);
  }
  if (!fs.existsSync(process.execPath)) {
    throw new Error('O executável do OmniYomi não está mais disponível em disco: ' + process.execPath);
  }

  log('INFO', 'Iniciando backend gerenciado em ' + serverUrl);
  log('INFO', 'Diretório físico de trabalho do backend: ' + backendCwd);
  backend = spawn(process.execPath, [entry], {
    cwd: backendCwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: false
  });
  backendOwned = true;
  backendShutdownConfirmed = false;
  const child = backend;
  attachBackendLogs(child);
  child.on('error', (error) => log('ERROR', 'Falha ao iniciar backend: ' + error.message));
  child.on('exit', (code, signal) => {
    if (backend === child) {
      backend = null;
      if (!quitting) {
        backendOwned = false;
        setStatus('error', 'O backend encerrou inesperadamente (código ' + (code ?? 'n/a') + ', sinal ' + (signal ?? 'n/a') + ').');
      }
    }
  });

  setStatus('starting', 'Backend iniciado. Aguardando resposta de saúde...');
  try {
    await waitForServer(child, serverPort);
  } catch (error) {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    backend = null;
    backendOwned = false;
    throw error;
  }

  setStatus('online', 'OmniYomi está pronto para uso.');
  if (!process.argv.includes('--smoke-test')) createAppWindow();
  return { success: true, url: serverUrl, adopted: false };
}

function startBackend() {
  if (startPromise) return startPromise;
  startPromise = startBackendInternal().finally(() => { startPromise = null; });
  return startPromise;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.removeListener('close', onClose);
      resolve(value);
    };
    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);

    // Wait for "close", not only "exit": close confirms stdout/stderr were drained,
    // so the SQLite shutdown marker cannot be missed due to pipe buffering.
    child.once('close', onClose);
  });
}

async function stopBackend() {
  if (appWindow && !appWindow.isDestroyed()) appWindow.close();

  if (!backend || !backendOwned) {
    backend = null;
    backendOwned = false;
    if (currentStatus.state !== 'stopped') setStatus('stopped', 'Nenhum backend iniciado por este aplicativo será encerrado.');
    return { success: true };
  }

  const child = backend;
  setStatus('stopping', 'Encerrando downloads, serviços e banco de dados com segurança...');

  // Send a private command through the child stdin pipe. This works on Windows
  // where SIGTERM may terminate Node without running its graceful handler.
  let gracefulCommandSent = false;
  try {
    if (!child.stdin || child.stdin.destroyed || !child.stdin.writable) {
      throw new Error('Canal de controle do backend indisponível.');
    }
    child.stdin.write('OMNIYOMI_SHUTDOWN\n');
    gracefulCommandSent = true;
    log('INFO', 'Comando de encerramento gracioso enviado ao backend.');
  } catch (error) {
    log('WARN', 'Não foi possível usar o canal privado de encerramento: ' + (error?.message || error));
  }

  if (!gracefulCommandSent) {
    try { child.kill('SIGTERM'); } catch (error) { log('ERROR', 'Falha ao solicitar encerramento por sinal: ' + error.message); }
  }

  let exited = await waitForExit(child, 35000);
  if (!exited && child.exitCode === null) {
    log('WARN', 'O encerramento gracioso excedeu 35 segundos. Solicitando término forçado do processo gerenciado.');
    try { child.kill(); } catch { /* process may already have exited */ }
    exited = await waitForExit(child, 5000);
  }

  if (!exited) {
    log('ERROR', 'O processo do backend não confirmou o encerramento.');
    return { success: false, error: 'O backend não confirmou o encerramento.' };
  }

  if (!backendShutdownConfirmed || child.exitCode !== 0) {
    const reason = !backendShutdownConfirmed
      ? 'O backend encerrou sem confirmar o checkpoint e fechamento do SQLite.'
      : 'O backend encerrou com código ' + child.exitCode + '.';
    log('ERROR', reason);
    if (backend === child) backend = null;
    backendOwned = false;
    setStatus('error', reason);
    return { success: false, error: reason };
  }

  if (backend === child) backend = null;
  backendOwned = false;
  setStatus('stopped', 'Servidor encerrado e SQLite confirmado como fechado.');
  return { success: true };
}


function broadcastUpdate() {
  broadcast('update', updateStatus);
}

function configureAutoUpdates() {
  // Portable builds are self-contained executables and are not safely replaceable
  // by electron-updater. The NSIS-installed build is the supported update channel.
  if (!app.isPackaged || process.platform !== 'win32' || process.env.PORTABLE_EXECUTABLE_DIR) {
    updateStatus = { ...updateStatus, state: 'unsupported' };
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => {
    updateStatus = { ...updateStatus, state: 'checking', error: null };
    broadcastUpdate();
    log('UPDATE', 'Verificando atualizações no canal oficial do OmniYomi.');
  });
  autoUpdater.on('update-available', (info) => {
    updateStatus = { ...updateStatus, state: 'downloading', version: info.version, releaseNotes: info.releaseNotes || null, error: null };
    broadcastUpdate();
    log('UPDATE', 'Atualização ' + info.version + ' encontrada. Download iniciado.');
  });
  autoUpdater.on('update-not-available', (info) => {
    updateStatus = { ...updateStatus, state: 'current', version: info.version || app.getVersion(), error: null };
    broadcastUpdate();
    log('UPDATE', 'OmniYomi já está na versão mais recente.');
  });
  autoUpdater.on('download-progress', (progress) => {
    updateStatus = { ...updateStatus, state: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))) };
    broadcastUpdate();
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateStatus = { ...updateStatus, state: 'downloaded', version: info.version, percent: 100, error: null };
    broadcastUpdate();
    log('UPDATE', 'Atualização baixada e validada. Pronta para instalar ao reiniciar.');
  });
  autoUpdater.on('error', (error) => {
    updateStatus = { ...updateStatus, state: 'error', error: error?.message || String(error) };
    broadcastUpdate();
    log('UPDATE-ERROR', updateStatus.error);
  });

  // Check shortly after startup, then periodically so an app left open also
  // notices a newly published, validated stable release without requiring restart.
  const checkForDesktopUpdate = () => {
    if (quitting || updateStatus.state === 'downloading' || updateStatus.state === 'downloaded') return;
    autoUpdater.checkForUpdates().catch((error) => {
      updateStatus = { ...updateStatus, state: 'error', error: error?.message || String(error) };
      broadcastUpdate();
      log('UPDATE-ERROR', updateStatus.error);
    });
  };

  setTimeout(checkForDesktopUpdate, 10000);
  updateCheckInterval = setInterval(checkForDesktopUpdate, 10 * 60 * 1000);
  if (typeof updateCheckInterval.unref === 'function') updateCheckInterval.unref();
}

function createAppWindow() {
  if (appWindow && !appWindow.isDestroyed()) {
    appWindow.show();
    appWindow.focus();
    return;
  }
  if (!serverUrl) return;

  appWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0f1117',
    show: false,
    title: 'OmniYomi',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  appWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  appWindow.once('ready-to-show', () => { if (appWindow) appWindow.show(); });
  appWindow.on('closed', () => { appWindow = null; });
  appWindow.loadURL(serverUrl).catch((error) => {
    log('ERROR', 'Não foi possível abrir a interface: ' + error.message);
    dialog.showErrorBox('Falha ao abrir OmniYomi', error.message);
  });
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 760,
    height: 660,
    minWidth: 680,
    minHeight: 590,
    resizable: true,
    title: APP_NAME,
    backgroundColor: '#10131c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  launcherWindow.loadFile(path.join(__dirname, 'launcher.html'));
  launcherWindow.on('closed', () => { launcherWindow = null; });
}

ipcMain.handle('omniyomi:get-state', () => ({
  ...currentStatus,
  dataDir,
  logsDir,
  logs: recentLogs,
  update: updateStatus
}));
ipcMain.handle('omniyomi:start', async () => {
  try { return await startBackend(); }
  catch (error) {
    const message = error?.message || String(error);
    setStatus('error', message);
    return { success: false, error: message };
  }
});
ipcMain.handle('omniyomi:stop', () => stopBackend());
ipcMain.handle('omniyomi:open-app', async () => {
  if (!serverUrl || !(await getHealth(serverPort))) {
    return { success: false, error: 'Inicie o servidor antes de abrir o OmniYomi.' };
  }
  createAppWindow();
  return { success: true };
});
ipcMain.handle('omniyomi:open-data', () => shell.openPath(dataDir));
ipcMain.handle('omniyomi:open-logs', () => shell.openPath(logsDir));
ipcMain.handle('omniyomi:show-log-file', () => shell.openPath(logFile));
ipcMain.handle('omniyomi:check-updates', async () => {
  if (updateStatus.state === 'unsupported') return updateStatus;
  try { await autoUpdater.checkForUpdates(); } catch (error) { log('UPDATE-ERROR', error?.message || error); }
  return updateStatus;
});
ipcMain.handle('omniyomi:install-update', async () => {
  if (updateStatus.state !== 'downloaded') return { success: false, error: 'A atualização ainda não foi baixada.' };
  const stopped = await stopBackend();
  if (!stopped.success) return { success: false, error: stopped.error || 'Não foi possível encerrar o backend com segurança.' };
  allowQuit = true;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { success: true };
});
ipcMain.handle('omniyomi:quit', () => app.quit());

app.on('before-quit', (event) => {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  if (allowQuit) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  Promise.resolve(stopBackend()).catch((error) => log('ERROR', error.message)).finally(() => {
    allowQuit = true;
    app.quit();
  });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (launcherWindow && !launcherWindow.isDestroyed()) {
      if (launcherWindow.isMinimized()) launcherWindow.restore();
      launcherWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    ensureDirectories();
    if (process.argv.includes('--smoke-test')) {
      try {
        await startBackend();
        const stopped = await stopBackend();
        if (!stopped.success) throw new Error(stopped.error || 'Falha no encerramento do backend.');
        allowQuit = true;
        app.exit(0);
      } catch (error) {
        log('ERROR', 'Desktop smoke test falhou: ' + (error?.stack || error));
        await stopBackend();
        app.exit(1);
      }
      return;
    }
    createLauncherWindow();
    configureAutoUpdates();
  });

  app.on('activate', () => {
    if (!launcherWindow && !appWindow) createLauncherWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
