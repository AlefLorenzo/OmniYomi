import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ensureSuwayomiRuntime } = require('./runtime-manager.cjs');
const dataDir = path.join(os.tmpdir(), 'omniyomi-runtime-ci', 'data');
process.env.OMNIYOMI_DATA_DIR = dataDir;

async function main() {
  console.log('[Runtime smoke] Verificando runtime Suwayomi Windows x64...');
  const runtime = await ensureSuwayomiRuntime({ dataDir, logger: console.log });
  if (!runtime.installed || !runtime.home) throw new Error('Runtime Suwayomi não foi instalado/validado.');

  process.env.SUWAYOMI_HOME = runtime.home;
  const { suwayomiService } = await import('../dist/src/services/SuwayomiService.js');
  console.log('[Runtime smoke] Iniciando serviço e verificando GraphQL...');
  const started = await suwayomiService.ensureRunning();
  if (!started) throw new Error('Suwayomi não iniciou dentro do limite de tempo.');

  const about = await suwayomiService.queryGql('query { aboutServer { name version } }');
  if (!about?.aboutServer?.version || !String(about.aboutServer.name).toLowerCase().includes('suwayomi')) {
    throw new Error('Resposta aboutServer inválida: ' + JSON.stringify(about));
  }

  console.log('[Runtime smoke] PASSOU: ' + about.aboutServer.name + ' ' + about.aboutServer.version);
  await suwayomiService.stop();
  console.log('[Runtime smoke] Runtime encerrado.');
}

main().catch(async (error) => {
  console.error('[Runtime smoke] FALHOU:', error?.stack || error);
  try {
    const mod = await import('../dist/src/services/SuwayomiService.js');
    await mod.suwayomiService.stop();
  } catch {}
  process.exitCode = 1;
});
