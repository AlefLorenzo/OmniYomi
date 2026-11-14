import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, ToggleLeft, ToggleRight, Trash2, Package } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Loader, Empty } from '../components/ui/index';
import { Badge } from '../components/ui/CoverCard';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/utils';

export function SourcesPage() {
  const { show } = useToast();
  const [sources, setSources] = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthChecking, setHealthChecking] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [srcs, exts] = await Promise.all([api.getSources(), api.getAvailableExtensions()]);
      setSources(srcs);
      setExtensions(exts);
    } finally {
      setLoading(false);
    }
  }

  async function handleHealthCheck(id: string) {
    setHealthChecking(prev => new Set([...prev, id]));
    try {
      const result = await api.checkSourceHealth(id);
      setSources(prev => prev.map(s => s.id === id ? { ...s, health: { status: result.status, lastChecked: Date.now() } } : s));
      show(result.message, result.status === 'OK' ? 'success' : 'error');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setHealthChecking(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function handleToggle(id: string, currentEnabled: boolean) {
    try {
      await api.toggleSource(id, !currentEnabled);
      setSources(prev => prev.map(s => s.id === id ? { ...s, isEnabled: !currentEnabled } : s));
      show(`Fonte ${!currentEnabled ? 'ativada' : 'desativada'}`, 'info');
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  async function handleUninstall(id: string) {
    if (!confirm(`Desinstalar a extensão "${id}"?`)) return;
    try {
      await api.uninstallExtension(id);
      setSources(prev => prev.filter(s => s.id !== id));
      setExtensions(prev => prev.map(e => e.id === id ? { ...e, isInstalled: false } : e));
      show('Extensão removida', 'info');
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  const installedIds = new Set(sources.map(s => s.id));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fontes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{sources.length} fontes instaladas</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadAll}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1e29] border border-[#2a3040] rounded-lg p-1 w-fit">
        {(['installed', 'available'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn('text-sm px-4 py-1.5 rounded transition-colors font-medium', activeTab === tab ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-200')}
          >
            {tab === 'installed' ? 'Instaladas' : 'Disponíveis'}
          </button>
        ))}
      </div>

      {/* Installed sources */}
      {activeTab === 'installed' && (
        <div className="space-y-3">
          {sources.length === 0 ? (
            <Empty icon="📦" title="Nenhuma fonte instalada" />
          ) : sources.map(src => (
            <div key={src.id} className={cn('flex items-center gap-3 p-4 rounded-xl border transition-colors', src.isEnabled ? 'bg-[#1a1e29] border-[#2a3040]' : 'bg-[#131720] border-[#1a1f2e] opacity-60')}>
              <img
                src={src.iconUrl}
                alt={src.name}
                className="w-10 h-10 rounded-lg flex-shrink-0 object-contain"
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x40/1a1e29/8b5cf6?text=?'; }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-200">{src.name}</span>
                  <span className="text-xs text-gray-600">v{src.version}</span>
                  <span className="text-xs bg-[#2a3040] px-1.5 py-0.5 rounded text-gray-500">{src.lang}</span>
                  {src.isNsfw && <span className="text-xs bg-red-900/50 px-1.5 py-0.5 rounded text-red-400">NSFW</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {src.health?.status === 'OK' ? (
                    <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Online</span>
                  ) : src.health?.status === 'ERROR' ? (
                    <span className="flex items-center gap-1 text-xs text-red-400"><XCircle size={11} /> Falha</span>
                  ) : null}
                  <span className="text-xs text-gray-600">{src.baseUrl}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleHealthCheck(src.id)}
                  disabled={healthChecking.has(src.id)}
                  className="text-xs text-gray-500 hover:text-purple-400 transition-colors p-1.5 rounded hover:bg-purple-900/20 disabled:opacity-50"
                  title="Testar conexão"
                >
                  {healthChecking.has(src.id) ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>

                <button
                  onClick={() => handleToggle(src.id, src.isEnabled)}
                  className={cn('transition-colors', src.isEnabled ? 'text-green-400 hover:text-green-300' : 'text-gray-600 hover:text-gray-400')}
                  title={src.isEnabled ? 'Desativar' : 'Ativar'}
                >
                  {src.isEnabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>

                {src.id !== 'mangadex' && src.id !== 'local' && (
                  <button
                    onClick={() => handleUninstall(src.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors p-1"
                    title="Desinstalar"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Available extensions catalog */}
      {activeTab === 'available' && (
        <div className="space-y-3">
          {extensions.map(ext => (
            <div key={ext.id} className="flex items-center gap-3 p-4 bg-[#1a1e29] border border-[#2a3040] rounded-xl">
              <img
                src={ext.iconUrl}
                alt={ext.name}
                className="w-10 h-10 rounded-lg flex-shrink-0 object-contain bg-[#131720]"
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x40/1a1e29/8b5cf6?text=?'; }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-200">{ext.name}</span>
                  <span className="text-xs text-gray-600">v{ext.version}</span>
                  <span className="text-xs bg-[#2a3040] px-1.5 py-0.5 rounded text-gray-500">{ext.lang}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{ext.description}</p>
                <p className="text-xs text-gray-700">por {ext.author}</p>
              </div>

              <div>
                {installedIds.has(ext.id) ? (
                  <span className="text-xs text-green-400 flex items-center gap-1 px-3 py-1.5 bg-green-900/20 border border-green-700/30 rounded-lg">
                    <CheckCircle size={12} /> Instalada
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 flex items-center gap-1.5 px-3 py-1.5 bg-[#131720] border border-[#2a3040] rounded-lg">
                    <Package size={12} /> Em breve
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
