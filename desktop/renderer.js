const api = window.omniyomiDesktop;
const $ = (id) => document.getElementById(id);
const startButton = $('start-button');
const openButton = $('open-button');
const stopButton = $('stop-button');
const progressWrap = $('progress-wrap');
const progressText = $('progress-text');

function addLog(line) {
  const container = $('logs');
  const empty = container.querySelector('.log-empty');
  if (empty) empty.remove();
  const item = document.createElement('p');
  item.className = 'log-line';
  item.textContent = line;
  container.appendChild(item);
  while (container.children.length > 100) container.removeChild(container.firstChild);
  container.scrollTop = container.scrollHeight;
}
function setProgress(active, text) {
  progressWrap.hidden = !active;
  progressText.textContent = text || '';
}
function applyState(state) {
  const online = state.state === 'online';
  const busy = state.state === 'starting' || state.state === 'stopping';
  $('status-title').innerHTML = online ? 'OmniYomi está<br><em>pronto para ler.</em>' :
    state.state === 'error' ? 'Algo precisa<br><em>de atenção.</em>' : 'Seu leitor,<br><em>no seu computador.</em>';
  $('status-message').textContent = state.message || '';
  $('status-dot').className = 'pulse' + (online ? ' online' : '');
  $('status-label').textContent = online ? 'SERVIDOR ONLINE' : busy ? 'PROCESSANDO' : state.state === 'error' ? 'ERRO DE INICIALIZAÇÃO' : 'PRONTO PARA INICIAR';
  $('state-pill').textContent = online ? 'Online' : busy ? 'Em execução' : state.state === 'error' ? 'Erro' : 'Desligado';
  $('backend-state').textContent = online ? 'Online · ' + (state.port || '') : busy ? 'Iniciando...' : state.state === 'error' ? 'Verificar logs' : 'Desligado';
  $('runtime-state').textContent = online ? 'Gerenciado pelo backend' : 'Verificado ao iniciar';
  startButton.disabled = online || busy;
  openButton.disabled = !online;
  stopButton.disabled = !online || state.adopted === true;
  if (state.dataDir) $('data-path').textContent = state.dataDir;
  setProgress(busy, busy ? state.message : '');
}
async function initialize() {
  const state = await api.getState();
  applyState(state);
  $('data-path').textContent = state.dataDir || '';
  (state.logs || []).forEach(addLog);
}
startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  setProgress(true, 'Verificando banco, preparando dados e iniciando o backend...');
  const result = await api.start();
  if (result.success) {
    applyState({ state: 'online', message: 'Servidor iniciado e validado.', port: new URL(result.url).port, url: result.url, adopted: result.adopted });
    addLog('[DESKTOP] Servidor validado pelo endpoint /api/health.');
  } else {
    applyState({ state: 'error', message: result.error || 'Falha ao iniciar.' });
    addLog('[ERRO] ' + (result.error || 'Falha ao iniciar.'));
  }
});
openButton.addEventListener('click', async () => {
  const result = await api.openApp();
  if (!result.success) addLog('[ERRO] ' + result.error);
});
stopButton.addEventListener('click', async () => {
  stopButton.disabled = true;
  setProgress(true, 'Encerrando processos e sincronizando o banco...');
  await api.stop();
});
$('data-button').addEventListener('click', () => api.openData());
$('logs-button').addEventListener('click', () => api.openLogs());
$('quit-button').addEventListener('click', () => api.quit());
api.onStatus(applyState);
api.onLog(addLog);
initialize().catch((error) => addLog('[ERRO] ' + error.message));
