import { useEffect, useState } from 'react';
import { Save, FolderOpen, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Input, Select, Loader } from '../components/ui/index';
import { useToast } from '../components/ui/ToastProvider';

export function SettingsPage() {
  const { show } = useToast();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingFlare, setTestingFlare] = useState(false);
  const [flareStatus, setFlareStatus] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(s => { setSettings(s); setLoading(false); });
    api.getFlareSolverrStatus().then(st => setFlareStatus(st.message)).catch(() => {});
  }, []);

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
