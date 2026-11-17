import path from 'node:path';
import assert from 'node:assert/strict';
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

  console.log('[Runtime smoke] Validando leitura do catálogo real de extensões Mihon...');
  const { repoManager } = await import('../dist/src/services/RepoManager.js');
  const keiyoushiIndex = 'https://github.com/keiyoushi/extensions/raw/repo/index.pb';
  const repoExtensions = await repoManager.getAllExtensions(undefined, undefined, keiyoushiIndex);
  if (repoExtensions.length === 0) throw new Error('O parser não retornou extensões do índice Keiyoushi.');
  const validExtensions = repoExtensions.filter((extension) =>
    extension.isCompatible &&
    /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(extension.pkg) &&
    /^https:\/\//i.test(extension.apkUrl) &&
    extension.sources.length > 0
  );
  if (validExtensions.length === 0) {
    throw new Error('O catálogo foi lido, mas nenhuma extensão compatível possui pacote, APK HTTPS e fontes válidas.');
  }
  const uniquePackages = new Set(repoExtensions.map((extension) => extension.pkg));
  if (uniquePackages.size !== repoExtensions.length) throw new Error('O catálogo retornou pacotes duplicados.');
  await assert.rejects(
    () => repoManager.uninstallExtractedExtension('../invalid-package'),
    /Identificador de pacote inválido/,
    'A rota de desinstalação deve rejeitar identificadores com traversal.'
  );
  console.log('[Runtime smoke] Catálogo validado: ' + repoExtensions.length + ' extensões; ' +
    validExtensions.length + ' compatíveis e utilizáveis.');

  
  console.log('[Runtime smoke] Adicionando e sincronizando o catálogo oficial Keiyoushi...');
  await suwayomiService.syncExtensionStores([keiyoushiIndex]);

  const storesData = await suwayomiService.queryGql(`
    query {
      extensionStores {
        nodes {
          indexUrl
          name
        }
      }
    }
  `);
  const stores = storesData?.extensionStores?.nodes || [];
  if (!stores.some((store) => store.indexUrl === keiyoushiIndex)) {
    throw new Error('O runtime não confirmou o registro do repositório Keiyoushi.');
  }

  const catalogData = await suwayomiService.queryGql(`
    query {
      extensions(first: 5) {
        totalCount
        nodes {
          pkgName
          versionName
          extensionLib
        }
      }
    }
  `);
  const extensionCatalog = catalogData?.extensions?.nodes || [];
  const totalExtensions = Number(catalogData?.extensions?.totalCount || 0);
  if (extensionCatalog.length === 0 || totalExtensions === 0) {
    throw new Error('O runtime não retornou nenhuma extensão após sincronizar o repositório.');
  }
  console.log('[Runtime smoke] Catálogo OK: ' + totalExtensions + ' extensões; amostra ' +
    extensionCatalog.map((entry) => entry.pkgName + ' (' + (entry.extensionLib || 'API?') + ')').join(', '));

  await suwayomiService.stop();
  console.log('[Runtime smoke] Runtime e teste do catálogo encerrados.');
}

main().catch(async (error) => {
  console.error('[Runtime smoke] FALHOU:', error?.stack || error);
  try {
    const mod = await import('../dist/src/services/SuwayomiService.js');
    await mod.suwayomiService.stop();
  } catch {}
  process.exitCode = 1;
});
