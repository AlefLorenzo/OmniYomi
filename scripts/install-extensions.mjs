const args = process.argv.slice(2);
const has = (value) => args.includes(value);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const baseUrl = (process.env.OMNIYOMI_URL || 'http://127.0.0.1:4567').replace(/\/+$/, '');
const language = valueAfter('--lang', 'all').toLowerCase();
const limit = Number.parseInt(valueAfter('--limit', '0'), 10) || 0;
const includeNsfw = has('--include-nsfw');

async function request(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(20 * 60 * 1000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'HTTP ' + response.status);
  return body;
}

async function main() {
  if (!has('--confirm')) {
    console.log('Este comando instala em sequência os APKs de todas as extensões compatíveis dos repositórios habilitados.');
    console.log('Pode baixar muitos arquivos e ocupar bastante espaço. Extensões já instaladas e validadas serão puladas.');
    console.log('');
    console.log('Confirmar todas: npm run extensions:install-all -- --confirm');
    console.log('Somente PT-BR: npm run extensions:install-all -- --confirm --lang pt-br');
    console.log('Teste com 5: npm run extensions:install-all -- --confirm --limit 5');
    console.log('Incluir fontes 18+: acrescente --include-nsfw');
    return;
  }

  console.log('[OmniYomi] Verificando backend...');
  const health = await request('/api/health');
  if (health.status !== 'ONLINE') throw new Error('A API não está ONLINE.');

  console.log('[OmniYomi] Atualizando os catálogos...');
  const syncResult = await request('/api/extensions/sync', { method: 'POST', body: '{}' });
  if (!syncResult.runtimeReady) {
    throw new Error('O runtime Suwayomi não está pronto. Execute setup.cmd ou scripts/setup.ps1 e tente novamente.');
  }

  const params = new URLSearchParams();
  if (language !== 'all') params.set('lang', language);
  const result = await request('/api/extensions/store' + (params.size ? '?' + params.toString() : ''));

  const byPackage = new Map();
  for (const extension of result.extensions || []) {
    if (!extension.pkg || extension.isCompatible === false || !extension.apkUrl) continue;
    if (extension.isNsfw && !includeNsfw) continue;
    if (!byPackage.has(extension.pkg)) byPackage.set(extension.pkg, extension);
  }

  const all = Array.from(byPackage.values());
  const queue = all.filter((extension) => !(extension.isInstalled && !extension.updateAvailable));
  const alreadyValid = all.length - queue.length;
  const todo = limit > 0 ? queue.slice(0, limit) : queue;

  console.log('Extensões compatíveis no catálogo: ' + all.length);
  console.log('Já instaladas corretamente (ignoradas): ' + alreadyValid);
  console.log('Para instalar/atualizar: ' + todo.length);
  if (todo.length < queue.length) console.log('Pendentes pelo limite selecionado: ' + (queue.length - todo.length));

  let installed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i++) {
    const extension = todo[i];
    console.log('[' + (i + 1) + '/' + todo.length + '] ' + extension.name + ' — ' + extension.pkg);
    try {
      const response = await request('/api/extensions/extract', {
        method: 'POST',
        body: JSON.stringify({
          pkg: extension.pkg,
          apkUrl: extension.apkUrl,
          repoUrl: extension.repoUrl,
        }),
      });

      if (response.extension?.skipped || response.skipped) {
        skipped++;
        console.log('  Já instalada e válida; pulando.');
      } else if (response.success) {
        installed++;
        console.log('  Instalação confirmada pelo runtime.');
      } else {
        throw new Error('O servidor não confirmou a instalação.');
      }
    } catch (error) {
      failed++;
      console.error('  Falhou: ' + error.message);
    }
  }

  console.log('');
  console.log('Resumo:');
  console.log('  Instaladas/atualizadas: ' + installed);
  console.log('  Puladas por já estarem corretas: ' + (alreadyValid + skipped));
  console.log('  Falhas: ' + failed);
  console.log('  Pendentes pelo limite: ' + Math.max(0, queue.length - todo.length));
  if (failed > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error('[OmniYomi] ERRO:', error.message);
  console.error('Inicie o OmniYomi Desktop primeiro ou defina OMNIYOMI_URL para a URL local correta.');
  process.exitCode = 1;
});
