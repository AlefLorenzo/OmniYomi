import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ensureSuwayomiRuntime } = require('./runtime-manager.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Set(process.argv.slice(2));
const skipBuild = flags.has('--skip-build');
const skipRuntime = flags.has('--skip-runtime');

function log(message) {
  console.log('[OmniYomi setup] ' + message);
}

function runNpm(args, cwd) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(executable, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('npm ' + args.join(' ') + ' falhou em ' + cwd + ' (código ' + result.status + ').');
  }
}

function nodeCheck() {
  const [major, minor] = process.versions.node.split('.').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(major) || major < 22 || (major === 22 && minor < 12)) {
    throw new Error('Node.js 22.12+ é necessário. Execute scripts/setup.ps1 para instalar ou atualizar automaticamente.');
  }
  log('Node.js ' + process.versions.node + ' detectado.');
}

function dependenciesAreValid(cwd) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(executable, ['ls', '--depth=0'], {
    cwd,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return result.status === 0;
}

function ensureDependencies(label, cwd) {
  if (dependenciesAreValid(cwd)) {
    log(label + ': já instaladas e válidas; pulando.');
    return;
  }
  log(label + ': instalação ausente/incompleta; executando npm install incremental.');
  runNpm(['install', '--no-audit', '--no-fund'], cwd);
}

async function main() {
  nodeCheck();
  const appData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const omniRoot = path.join(appData, 'OmniYomi');
  const dataDir = path.join(omniRoot, 'data');

  log('Preparando diretórios persistentes sem apagar dados existentes...');
  for (const folder of [
    dataDir,
    path.join(dataDir, 'downloads'),
    path.join(dataDir, 'extensions'),
    path.join(dataDir, 'extensions', 'cache'),
    path.join(dataDir, 'extensions', 'extracted'),
    path.join(dataDir, 'runtime'),
    path.join(dataDir, 'suwayomi-data'),
    path.join(omniRoot, 'logs'),
  ]) {
    fs.mkdirSync(folder, { recursive: true });
  }

  ensureDependencies('Dependências da raiz', root);
  ensureDependencies('Dependências do frontend', path.join(root, 'client'));

  if (process.platform === 'win32' && !skipRuntime) {
    await ensureSuwayomiRuntime({
      dataDir,
      logger: log,
      force: flags.has('--update-runtime'),
    });
  } else if (skipRuntime) {
    log('Runtime ignorado por --skip-runtime.');
  } else {
    log('O runtime Suwayomi automático é destinado ao Windows x64; pulando.');
  }

  if (!skipBuild) {
    log('Compilando frontend e backend...');
    runNpm(['run', 'build'], root);
    log('Build concluído.');
  } else {
    log('Build ignorado por --skip-build.');
  }

  log('Preparação concluída. Dados, biblioteca e downloads existentes foram preservados.');
  log('Desktop em desenvolvimento: npm run desktop:dev');
  log('Sincronizar todos os catálogos: npm run extensions:sync (backend ligado).');
  log('Instalar todos os APKs compatíveis (opcional): npm run extensions:install-all -- --confirm --lang pt-br');
}

main().catch((error) => {
  console.error('[OmniYomi setup] ERRO:', error?.stack || error);
  process.exitCode = 1;
});
