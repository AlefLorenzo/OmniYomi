const baseUrl = (process.env.OMNIYOMI_URL || 'http://127.0.0.1:4567').replace(/\/+$/, '');

async function request(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'HTTP ' + response.status + ' em ' + path);
  return body;
}

async function main() {
  console.log('[OmniYomi] Verificando backend em ' + baseUrl + '...');
  const health = await request('/api/health');
  if (health.status !== 'ONLINE') throw new Error('O backend não está ONLINE.');

  console.log('[OmniYomi] Sincronizando os repositórios habilitados...');
  const result = await request('/api/extensions/sync', { method: 'POST', body: '{}' });

  console.log('');
  console.log('Catálogos sincronizados:');
  console.log('  Repositórios: ' + result.repositories);
  console.log('  Extensões encontradas: ' + result.extensions);
  console.log('  Compatíveis com o runtime: ' + result.compatible);
  console.log('  Instaladas e validadas: ' + result.installed);
  console.log('  Runtime Suwayomi: ' + (result.runtimeReady ? 'ONLINE' : 'indisponível'));
  console.log('');
  console.log('Os índices foram atualizados. Os APKs não são baixados nessa etapa.');
}

main().catch((error) => {
  console.error('[OmniYomi] ERRO:', error.message);
  console.error('Inicie o OmniYomi Desktop primeiro ou defina OMNIYOMI_URL para a URL local correta.');
  process.exitCode = 1;
});
