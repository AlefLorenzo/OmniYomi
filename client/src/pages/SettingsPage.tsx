import { useEffect, useState } from 'react';
import { Save, FolderOpen, RefreshCw, ShieldCheck, ShieldAlert, Server, Wifi, WifiOff, CheckCircle, Download, ArrowUpCircle } from 'lucide-react';
import { api, getApiBaseUrl, setApiBaseUrl } from '../lib/api';
import { Button, Input, Select, Loader } from '../components/ui/index';
import { useToast } from '../components/ui/ToastProvider';
import { checkForUpdate, CURRENT_VERSION, type ReleaseInfo } from '../lib/updater';

export function SettingsPage() {
  const { show } = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingFlare, setTestingFlare] = useState(false);
  const [flareStatus, setFlareStatus] = useState<string | null>(null);

  // Server URL settings
  const [serverUrl, setServerUrlState] = useState<string>(getApiBaseUrl() || 'http://192.168.0.111:8888');
  const [testingServer, setTestingServer] = useState(false);
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);

  // GitHub Updates
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<ReleaseInfo | null>(null);
  const [updateChecked, setUpdateChecked] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const s = await api.getSettings();
      setSettings(s);
      setServerConnected(true);
    } catch (e: any) {
      // Fallback settings if server is not reachable yet
      setSettings({
        downloadPath: 'data/downloads',
        concurrentDownloads: 2,
        autoDownloadNew: false,
        readerMode: 'vertical_webtoon',
        fitMode: 'fit_width',
        pageSpacing: 4,
        autoMarkReadPercent: 80,
      });
      setServerConnected(false);
    } finally {
      setLoading(false);
    }

    try {
      const st = await api.getFlareSolverrStatus();
      setFlareStatus(st.message);
    } catch {}
  };

  const handleTestServer = async () => {
    setTestingServer(true);
    try {
      setApiBaseUrl(serverUrl);
      const res = await api.health();
      setServerConnected(true);
      show(`Conectado ao OmniYomi Server (${res.status})!`, 'success');
      loadData();
    } catch (e: any) {
      setServerConnected(false);
      show(`Erro de conexão: ${e.message}`, 'error');
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveServer = () => {
    setApiBaseUrl(serverUrl);
    show('Endereço do servidor salvo! Recarregando dados...', 'success');
    loadData();
  };

  const handleTestFlare = async () => {
    setTestingFlare(true);
    try {
      const res = await api.getFlareSolverrStatus();
      setFlareStatus(res.message);
      show(res.available ? 'FlareSolverr conectado com sucesso!' : res.message, res.available ? 'success' : 'info');
    } catch (e: any) {
      show(`Erro ao testar FlareSolverr: ${e.message}`, 'error');
    } finally {
      setTestingFlare(false);
    }
  };

  const handleCheckGitHubUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateChecked(true);
    try {
      const release = await checkForUpdate();
      setUpdateAvailable(release);
      if (release) {
        show(`Nova versão v${release.version} disponível no GitHub!`, 'info');
      } else {
        show('OmniYomi está atualizado na versão mais recente!', 'success');
      }
    } catch (e: any) {
      show('Erro ao verificar atualizações no GitHub.', 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      show('Configurações salvas com sucesso!', 'success');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  const update = (key: string, value: any) => setSettings((prev: any) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-gray-500 mt-0.5">Personalize o comportamento do OmniYomi</p>
      </div>

      {/* Backend Server Configuration */}
      <section className="bg-[#1a1e29] border border-purple-500/30 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#2a3040] pb-3">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-purple-400" />
            <h2 className="text-base font-semibold text-gray-200">Servidor Backend OmniYomi</h2>
          </div>
          {serverConnected !== null && (
            <span className={`text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 font-medium ${
              serverConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}>
              {serverConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
              {serverConnected ? 'Online / Conectado' : 'Desconectado'}
            </span>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">
            Endereço do Servidor (IP e porta)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={serverUrl}
              onChange={e => setServerUrlState(e.target.value)}
              placeholder="http://192.168.0.111:4567"
              className="flex-1 bg-[#131720] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleTestServer} loading={testingServer}>
                <RefreshCw size={14} />
                Testar
              </Button>
              <Button size="sm" onClick={handleSaveServer}>
                <Save size={14} />
                Salvar
              </Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            No aplicativo Android, informe o IP do computador na rede Wi-Fi (ex: <code>http://192.168.0.111:4567</code>).
          </p>
        </div>
      </section>

      {/* Downloads */}
      <section className="bg-[#1a1e29] border border-[#2a3040] rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-200 border-b border-[#2a3040] pb-3">Downloads</h2>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Pasta de downloads</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.downloadPath}
              onChange={e => update('downloadPath', e.target.value)}
              className="flex-1 bg-[#131720] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
            <Button variant="secondary" size="sm">
              <FolderOpen size={14} />
            </Button>
          </div>
          <p className="text-xs text-gray-600 mt-1">Localização onde os capítulos serão salvos</p>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Downloads simultâneos</label>
          <input
            type="range"
            min={1}
            max={5}
            value={settings.concurrentDownloads}
            onChange={e => update('concurrentDownloads', parseInt(e.target.value))}
            className="w-full accent-purple-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>1 (mais lento)</span>
            <span className="text-purple-400 font-medium">{settings.concurrentDownloads} simultâneo{settings.concurrentDownloads !== 1 ? 's' : ''}</span>
            <span>5 (mais rápido)</span>
          </div>
        </div>
      </section>

      {/* Reader */}
      <section className="bg-[#1a1e29] border border-[#2a3040] rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-200 border-b border-[#2a3040] pb-3">Leitor</h2>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Modo de leitura padrão</label>
          <select
            value={settings.defaultReaderMode}
            onChange={e => update('defaultReaderMode', e.target.value)}
            className="w-full bg-[#131720] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="vertical_webtoon">Rolagem vertical (Manhwa/Webtoon)</option>
            <option value="paged_rtl">Paginado — Direita para esquerda (Mangá japonês)</option>
            <option value="paged_ltr">Paginado — Esquerda para direita (Mangá ocidental)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Ajuste de imagem padrão (modo paginado)</label>
          <select
            value={settings.defaultFitMode}
            onChange={e => update('defaultFitMode', e.target.value)}
            className="w-full bg-[#131720] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value="fit_width">Ajustar à largura</option>
            <option value="fit_height">Ajustar à altura</option>
            <option value="fit_screen">Ajustar à tela</option>
            <option value="original">Tamanho original</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Espaçamento entre páginas (Webtoon)</label>
          <input
            type="range"
            min={0}
            max={32}
            value={settings.pageSpacing}
            onChange={e => update('pageSpacing', parseInt(e.target.value))}
            className="w-full accent-purple-500"
          />
          <p className="text-xs text-gray-600 mt-1 text-center">{settings.pageSpacing}px</p>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Marcar como lido automaticamente após</label>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={settings.autoMarkReadPercent}
            onChange={e => update('autoMarkReadPercent', parseInt(e.target.value))}
            className="w-full accent-purple-500"
          />
          <p className="text-xs text-gray-600 mt-1 text-center">{settings.autoMarkReadPercent}% do capítulo lido</p>
        </div>
      </section>

      {/* Library updates */}
      <section className="bg-[#1a1e29] border border-[#2a3040] rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-200 border-b border-[#2a3040] pb-3">Atualizações Automáticas</h2>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Verificar novos capítulos a cada</label>
          <select
            value={settings.autoUpdateIntervalMinutes}
            onChange={e => update('autoUpdateIntervalMinutes', parseInt(e.target.value))}
            className="w-full bg-[#131720] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          >
            <option value={15}>15 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
            <option value={360}>6 horas</option>
            <option value={720}>12 horas</option>
            <option value={1440}>24 horas</option>
          </select>
        </div>
      </section>

      {/* Cloudflare / FlareSolverr */}
      <section className="bg-[#1a1e29] border border-[#2a3040] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#2a3040] pb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-200">Proteção Cloudflare & FlareSolverr</h2>
            <p className="text-xs text-gray-500">Serviço auxiliar para resolução de desafios Cloudflare em fontes protegidas</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleTestFlare} loading={testingFlare}>
            <RefreshCw size={13} /> Testar Conexão
          </Button>
        </div>

        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">URL da API FlareSolverr</label>
          <input
            type="text"
            value={settings.flaresolverrUrl || 'http://localhost:8191/v1'}
            onChange={e => update('flaresolverrUrl', e.target.value)}
            placeholder="http://localhost:8191/v1"
            className="w-full bg-[#131720] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          <p className="text-xs text-gray-500 mt-1">
            Endpoint v1 do container FlareSolverr (ex.: docker run -p 8191:8191 ghcr.io/flaresolverr/flaresolverr)
          </p>
        </div>

        {flareStatus && (
          <div className="bg-[#131720] border border-[#2a3040] p-3 rounded-lg text-xs text-gray-300">
            <span className="font-semibold text-purple-400">Diagnóstico:</span> {flareStatus}
          </div>
        )}
      </section>

      {/* Atualizações do Aplicativo via GitHub */}
      <section className="bg-[#1a1e29] border border-purple-500/30 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#2a3040] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center">
              <ArrowUpCircle size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-200">Atualizações do OmniYomi</h2>
              <p className="text-xs text-gray-400">Versão instalada: <span className="text-purple-300 font-mono font-bold">v{CURRENT_VERSION}</span></p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleCheckGitHubUpdate} loading={checkingUpdate}>
            <RefreshCw size={13} /> Verificar Atualizações
          </Button>
        </div>

        {updateChecked && (
          <div>
            {updateAvailable ? (
              <div className="bg-purple-950/40 border border-purple-600/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Nova versão disponível: v{updateAvailable.version}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Publicada em {new Date(updateAvailable.publishedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <a
                    href={updateAvailable.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg"
                  >
                    <Download size={14} /> Baixar APK
                  </a>
                </div>
                {updateAvailable.releaseNotes && (
                  <div className="text-xs text-gray-300 bg-[#121620] p-3 rounded-lg border border-[#2a3040] whitespace-pre-wrap max-h-36 overflow-y-auto">
                    {updateAvailable.releaseNotes}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#131720] border border-[#2a3040] p-3 rounded-lg text-xs text-green-400 flex items-center gap-2">
                <CheckCircle size={15} />
                <span>O aplicativo já está atualizado na versão mais recente (v{CURRENT_VERSION}).</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Server */}
      <section className="bg-[#1a1e29] border border-[#2a3040] rounded-xl p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-200 border-b border-[#2a3040] pb-3">Servidor</h2>
        <div>
          <label className="text-xs text-gray-400 font-medium block mb-1">Porta do servidor</label>
          <input
            type="number"
            value={settings.port}
            onChange={e => update('port', parseInt(e.target.value))}
            min={1024}
            max={65535}
            className="w-full bg-[#131720] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          <p className="text-xs text-gray-600 mt-1">Reinicie o servidor para aplicar alterações de porta</p>
        </div>
      </section>

      <div className="flex gap-3">
        <Button onClick={handleSave} loading={saving} size="lg">
          <Save size={16} /> Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
