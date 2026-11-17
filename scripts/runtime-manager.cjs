const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const RELEASES_API = 'https://api.github.com/repos/Suwayomi/Suwayomi-Server/releases/latest';
const USER_AGENT = 'OmniYomi-Desktop/1.1.5';
const MIN_JAR_BYTES = 10 * 1024 * 1024;

function logTo(logger, message) {
  if (typeof logger === 'function') logger(message);
  else console.log(message);
}

async function isRuntimeInstalled(home) {
  try {
    const java = await fs.promises.stat(path.join(home, 'jre', 'bin', 'java.exe'));
    const jar = await fs.promises.stat(path.join(home, 'bin', 'Suwayomi-Server.jar'));
    return java.isFile() && jar.isFile() && jar.size >= MIN_JAR_BYTES;
  } catch {
    return false;
  }
}

async function latestRelease() {
  const response = await fetch(RELEASES_API, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(process.env.GITHUB_TOKEN ? { 'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN } : {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('GitHub Releases respondeu HTTP ' + response.status);
  const release = await response.json();
  const asset = (release.assets || []).find((item) => /windows-x64\.zip$/i.test(item.name || ''));
  if (!asset || !asset.browser_download_url || !asset.digest) {
    throw new Error('A release Suwayomi não disponibilizou ZIP Windows x64 com SHA-256.');
  }
  return { release, asset };
}

async function findRuntimeRoot(directory, depth = 0) {
  if (depth > 6) return null;
  if (await isRuntimeInstalled(directory)) return directory;
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = await findRuntimeRoot(path.join(directory, entry.name), depth + 1);
    if (candidate) return candidate;
  }
  return null;
}

async function downloadAndVerify(asset, archivePath, logger) {
  logTo(logger, 'Baixando runtime Suwayomi (' + Math.round((asset.size || 0) / 1024 / 1024) + ' MB)...');
  const response = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/octet-stream' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!response.ok || !response.body) throw new Error('Falha ao baixar runtime: HTTP ' + response.status);

  const hash = crypto.createHash('sha256');
  let received = 0;
  let lastProgress = -10;
  const transform = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      hash.update(chunk);
      const total = Number(asset.size) || 0;
      if (total > 0) {
        const progress = Math.floor(received / total * 100);
        if (progress >= lastProgress + 10) {
          lastProgress = progress;
          logTo(logger, 'Download do runtime: ' + Math.min(100, progress) + '%');
        }
      }
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), transform, fs.createWriteStream(archivePath, { flags: 'wx' }));

  const actual = hash.digest('hex').toLowerCase();
  const expected = String(asset.digest).replace(/^sha256:/i, '').toLowerCase();
  if (actual !== expected) throw new Error('SHA-256 do runtime não confere. Download descartado.');
  logTo(logger, 'Checksum SHA-256 validado.');
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

async function extractZip(archivePath, destination) {
  const command = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Expand-Archive -LiteralPath '" +
    escapePowerShell(archivePath) + "' -DestinationPath '" + escapePowerShell(destination) + "' -Force";
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';

  await new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error('Extração do ZIP excedeu 20 minutos.'));
    }, 20 * 60 * 1000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('Expand-Archive encerrou com código ' + code));
    });
  });
}

async function ensureSuwayomiRuntime(options = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    return { installed: false, skipped: true, reason: 'Runtime automático disponível apenas para Windows x64.' };
  }

  const logger = options.logger;
  const appData = process.env.LOCALAPPDATA || os.homedir();
  const dataDir = path.resolve(options.dataDir || path.join(appData, 'OmniYomi', 'data'));
  const runtimeRoot = path.join(dataDir, 'runtime');
  const runtimeHome = path.join(runtimeRoot, 'suwayomi');
  const metadataPath = path.join(runtimeRoot, 'suwayomi-install.json');
  const customHome = process.env.SUWAYOMI_HOME || process.env.OMNIYOMI_SUWAYOMI_HOME;

  if (customHome) {
    const home = path.resolve(customHome);
    if (await isRuntimeInstalled(home)) {
      logTo(logger, 'Runtime externo válido detectado em SUWAYOMI_HOME. Pulando.');
      return { installed: true, skipped: true, home };
    }
    throw new Error('SUWAYOMI_HOME está definido, mas a instalação Java/Suwayomi não passou na validação.');
  }

  await fs.promises.mkdir(runtimeRoot, { recursive: true });
  if (!options.force && await isRuntimeInstalled(runtimeHome)) {
    logTo(logger, 'Runtime Suwayomi já está instalado e íntegro. Pulando download.');
    return { installed: true, skipped: true, home: runtimeHome };
  }

  logTo(logger, 'Consultando a release estável do Suwayomi...');
  const { release, asset } = await latestRelease();
  const tempRoot = path.join(runtimeRoot, '.setup-' + process.pid + '-' + Date.now());
  const archivePath = path.join(tempRoot, asset.name);
  const extractedRoot = path.join(tempRoot, 'extracted');
  const stagedHome = path.join(tempRoot, 'runtime-staged');
  const backupHome = path.join(runtimeRoot, '.backup-' + Date.now());
  let movedOld = false;

  try {
    await fs.promises.mkdir(tempRoot, { recursive: true });
    await downloadAndVerify(asset, archivePath, logger);
    logTo(logger, 'Extraindo os arquivos do runtime...');
    await extractZip(archivePath, extractedRoot);

    const sourceHome = await findRuntimeRoot(extractedRoot);
    if (!sourceHome) throw new Error('O ZIP não contém jre/bin/java.exe e bin/Suwayomi-Server.jar.');
    await fs.promises.rename(sourceHome, stagedHome);
    if (!(await isRuntimeInstalled(stagedHome))) throw new Error('Validação dos arquivos extraídos falhou.');

    if (fs.existsSync(runtimeHome)) {
      await fs.promises.rename(runtimeHome, backupHome);
      movedOld = true;
    }
    try {
      await fs.promises.rename(stagedHome, runtimeHome);
    } catch (error) {
      if (movedOld && fs.existsSync(backupHome)) {
        await fs.promises.rename(backupHome, runtimeHome);
        movedOld = false;
      }
      throw error;
    }

    const metadata = {
      product: 'Suwayomi Server',
      version: release.tag_name || release.name || 'unknown',
      asset: asset.name,
      sha256: String(asset.digest).replace(/^sha256:/i, ''),
      installedAt: new Date().toISOString(),
      runtimeHome,
    };
    await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    if (movedOld && fs.existsSync(backupHome)) await fs.promises.rm(backupHome, { recursive: true, force: true });

    logTo(logger, 'Suwayomi ' + metadata.version + ' instalado e validado.');
    return { installed: true, skipped: false, home: runtimeHome, version: metadata.version };
  } catch (error) {
    if (movedOld && !fs.existsSync(runtimeHome) && fs.existsSync(backupHome)) {
      try { await fs.promises.rename(backupHome, runtimeHome); } catch {}
    }
    throw error;
  } finally {
    if (fs.existsSync(tempRoot)) {
      try { await fs.promises.rm(tempRoot, { recursive: true, force: true }); } catch {}
    }
  }
}

module.exports = { ensureSuwayomiRuntime, isRuntimeInstalled };
