import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, XCircle, RefreshCw, ToggleLeft, ToggleRight, Trash2,
  Package, Plus, Search, Globe, Download, HardDrive, ExternalLink, BookOpen
} from 'lucide-react';
import { api } from '../lib/api';
import { Button, Loader, Empty, Input, Modal } from '../components/ui/index';
import { Badge } from '../components/ui/CoverCard';
import { useToast } from '../components/ui/ToastProvider';
import { cn, formatRelativeDate } from '../lib/utils';

type Tab = 'installed' | 'store' | 'repos';

export function SourcesPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('installed');

  // Installed sources
  const [sources, setSources] = useState<any[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [healthChecking, setHealthChecking] = useState<Set<string>>(new Set());

  // Store extensions
  const [storeExtensions, setStoreExtensions] = useState<any[]>([]);
  const [storeTotal, setStoreTotal] = useState(0);
  const [loadingStore, setLoadingStore] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [storeLang, setStoreLang] = useState('all');
  const [storeRepo, setStoreRepo] = useState('all');
  const [extractingPkgs, setExtractingPkgs] = useState<Set<string>>(new Set());
  const searchDebounce = useRef<number | null>(null);

  // Repositories
  const [repos, setRepos] = useState<any[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);

  useEffect(() => {
    loadInstalledSources();
    loadRepos();
  }, []);

  useEffect(() => {
    if (activeTab === 'store') {
      loadStore(storeSearch, storeLang, storeRepo);
    } else if (activeTab === 'repos') {
      loadRepos();
    }
  }, [activeTab]);

  async function loadInstalledSources() {
    setLoadingSources(true);
    try {
      const list = await api.getSources();
      setSources(list);
    } finally {
      setLoadingSources(false);
    }
  }

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const list = await api.getRepos();
      setRepos(list);
    } finally {
      setLoadingRepos(false);
    }
  }

  async function loadStore(q?: string, lang?: string, repo?: string) {
    setLoadingStore(true);
    try {
      const res = await api.getStoreExtensions(q, lang, repo);
      setStoreExtensions(res.extensions || []);
      setStoreTotal(res.total || 0);
    } catch (e: any) {
      show(`Erro ao carregar loja: ${e.message}`, 'error');
    } finally {
      setLoadingStore(false);
    }
  }

  function handleStoreSearch(val: string) {
    setStoreSearch(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => {
      loadStore(val, storeLang, storeRepo);
    }, 400);
  }

  function handleStoreLangChange(l: string) {
    setStoreLang(l);
    loadStore(storeSearch, l, storeRepo);
  }

  function handleStoreRepoChange(r: string) {
    setStoreRepo(r);
    loadStore(storeSearch, storeLang, r);
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

  async function handleExtractApk(ext: any) {
    setExtractingPkgs(prev => new Set([...prev, ext.pkg]));
    try {
      await api.extractExtension(ext.pkg, ext.apkUrl, ext.repoUrl, ext);
      show(`Extensão "${ext.name}" instalada com sucesso!`, 'success');
      // Atualiza status local
      setStoreExtensions(prev => prev.map(e => e.pkg === ext.pkg ? { ...e, isExtracted: true, isInstalled: true } : e));
      loadInstalledSources();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setExtractingPkgs(prev => { const n = new Set(prev); n.delete(ext.pkg); return n; });
    }
  }

  async function handleUninstallExtracted(pkg: string) {
    if (!confirm('Desinstalar e apagar arquivos extraídos desta extensão?')) return;
    try {
      await api.uninstallExtracted(pkg);
      show('Extensão desinstalada', 'info');
      setStoreExtensions(prev => prev.map(e => e.pkg === pkg ? { ...e, isExtracted: false, isInstalled: false } : e));
      loadInstalledSources();
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  async function handleAddRepo() {
    if (!newRepoUrl.trim()) return;
    setAddingRepo(true);
    try {
      await api.addRepo(newRepoUrl.trim(), newRepoName.trim() || undefined);
      show('Repositório validado e adicionado!', 'success');
      setNewRepoUrl('');
      setNewRepoName('');
      setShowAddRepoModal(false);
      loadRepos();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setAddingRepo(false);
    }
  }

  async function handleDeleteRepo(url: string) {
    if (!confirm('Remover este repositório de extensões?')) return;
    try {
      await api.deleteRepo(url);
      show('Repositório removido', 'info');
      loadRepos();
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  async function handleToggleRepo(url: string, currentEnabled: boolean) {
    try {
      await api.toggleRepo(url, !currentEnabled);
      setRepos(prev => prev.map(r => r.url === url ? { ...r, enabled: !currentEnabled } : r));
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fontes & Extensões</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie fontes, repositórios e extração de extensões do Tachiyomi</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => {
          if (activeTab === 'installed') loadInstalledSources();
          else if (activeTab === 'store') loadStore(storeSearch, storeLang);
          else loadRepos();
        }}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1e29] border border-[#2a3040] rounded-lg p-1 w-full overflow-x-auto scrollbar-none">
        {(['installed', 'store', 'repos'] as Tab[]).map(tab => {
          const labels = {
            installed: `Fontes (${sources.length})`,
            store: `Loja Keiyoushi (${storeTotal > 0 ? storeTotal : '1.600+'})`,
            repos: `Repositórios (${repos.length > 0 ? repos.length : '1'})`,
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 sm:flex-initial text-xs sm:text-sm px-3 py-1.5 rounded transition-all font-medium cursor-pointer whitespace-nowrap text-center',
                activeTab === tab ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'
              )}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* TAB 1: INSTALLED SOURCES */}
      {activeTab === 'installed' && (
        <div className="space-y-3">
          {loadingSources ? (
            <div className="flex justify-center py-20"><Loader size="lg" /></div>
          ) : sources.length === 0 ? (
            <Empty icon="📦" title="Nenhuma fonte instalada" />
          ) : sources.map(src => (
            <div
              key={src.id}
              className={cn(
                'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border transition-colors',
                src.isEnabled ? 'bg-[#1a1e29] border-[#2a3040]' : 'bg-[#131720] border-[#1a1f2e] opacity-60'
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={src.iconUrl}
                  alt={src.name}
                  className="w-10 h-10 rounded-lg flex-shrink-0 object-contain bg-[#121620]"
                  onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x40/1a1e29/8b5cf6?text=?'; }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="font-semibold text-gray-200 text-sm truncate max-w-[200px]">{src.name}</span>
                    <span className="text-[11px] text-gray-400">v{src.version}</span>
                    <span className="text-[10px] bg-[#2a3040] px-1.5 py-0.2 rounded text-gray-400 uppercase font-semibold">{src.lang}</span>
                    {src.isNsfw && <span className="text-[10px] bg-red-900/50 px-1.5 py-0.2 rounded text-red-400 font-semibold">18+</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {src.health?.status === 'OK' ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-400"><CheckCircle size={11} /> Online</span>
                    ) : src.health?.status === 'ERROR' ? (
                      <span className="flex items-center gap-1 text-[11px] text-red-400"><XCircle size={11} /> Falha</span>
                    ) : null}
                    <span className="text-[11px] text-gray-400 truncate max-w-[220px]">{src.baseUrl || 'Extensão DEX'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 sm:pt-0 border-t border-[#242b3b] sm:border-0">
                <button
                  onClick={() => navigate(`/catalog?source=${encodeURIComponent(src.id)}`)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 text-xs bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white transition-all px-3 py-1.5 rounded-lg cursor-pointer font-medium"
                  title="Explorar obras desta fonte no catálogo"
                >
                  <BookOpen size={13} />
                  <span>Explorar</span>
                </button>

                {src.baseUrl && src.baseUrl.startsWith('http') && (
                  <a
                    href={src.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-xs bg-[#242c3d] hover:bg-[#2e374d] text-gray-300 hover:text-white transition-all px-2.5 py-1.5 rounded-lg cursor-pointer"
                    title="Visitar site oficial da fonte"
                  >
                    <ExternalLink size={12} />
                    <span className="hidden sm:inline">Site</span>
                  </a>
                )}

                <button
                  onClick={() => handleHealthCheck(src.id)}
                  disabled={healthChecking.has(src.id)}
                  className="text-xs text-gray-400 hover:text-purple-400 transition-colors p-1.5 rounded-lg hover:bg-purple-900/20 disabled:opacity-50"
                  title="Testar conexão"
                >
                  <RefreshCw size={14} className={healthChecking.has(src.id) ? 'animate-spin' : ''} />
                </button>

                <button
                  onClick={() => handleToggle(src.id, src.isEnabled)}
                  className={cn('transition-colors cursor-pointer p-1', src.isEnabled ? 'text-green-400 hover:text-green-300' : 'text-gray-400 hover:text-gray-400')}
                  title={src.isEnabled ? 'Desativar' : 'Ativar'}
                >
                  {src.isEnabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: STORE (EXTENSIONS FROM ALL REPOS) */}
      {activeTab === 'store' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="flex-1">
              <Input
                value={storeSearch}
                onChange={e => handleStoreSearch(e.target.value)}
                placeholder="Pesquisar entre quase 3.000 extensões (ex: Asura, Flame, Scan, Manga...)"
                leftIcon={<Search size={15} />}
              />
            </div>
            <div className="flex gap-2">
              <select
                value={storeRepo}
                onChange={e => handleStoreRepoChange(e.target.value)}
                className="bg-[#1a1e29] border border-[#2a3040] text-gray-200 rounded-lg px-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer max-w-[160px] truncate"
              >
                <option value="all">Todos os Repositórios</option>
                {repos.map(r => (
                  <option key={r.url} value={r.url}>{r.name}</option>
                ))}
              </select>

              <select
                value={storeLang}
                onChange={e => handleStoreLangChange(e.target.value)}
                className="bg-[#1a1e29] border border-[#2a3040] text-gray-200 rounded-lg px-2.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer min-w-[120px]"
              >
                <option value="all">Todos Idiomas</option>
                <option value="pt-br">Português (PT-BR)</option>
                <option value="en">Inglês (EN)</option>
                <option value="es">Espanhol (ES)</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {storeExtensions.length} extensões encontradas {storeSearch && `para "${storeSearch}"`}
          </p>

          {loadingStore ? (
            <div className="flex justify-center py-20"><Loader size="lg" label="Carregando repositórios..." /></div>
          ) : storeExtensions.length === 0 ? (
            <Empty icon="🔍" title="Nenhuma extensão encontrada" description="Tente outro termo de busca ou filtro de idioma" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {storeExtensions.slice(0, 100).map(ext => (
                <div key={ext.pkg} className="flex items-center gap-3 p-3 bg-[#1a1e29] border border-[#2a3040] rounded-xl hover:border-purple-500/30 transition-colors">
                  <img
                    src={ext.iconUrl}
                    alt={ext.name}
                    className="w-11 h-11 rounded-lg flex-shrink-0 object-contain bg-[#121620]"
                    onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/44x44/1a1e29/8b5cf6?text=APK'; }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-100 text-sm truncate">{ext.name}</span>
                      <span className="text-[10px] text-gray-500">v{ext.version}</span>
                      <span className="text-[10px] bg-[#2a3040] text-gray-300 px-1.5 py-0.2 rounded uppercase font-mono">{ext.lang}</span>
                      {ext.isNsfw && <span className="text-[10px] bg-red-900/60 text-red-300 px-1 rounded">18+</span>}
                    </div>

                    <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">{ext.pkg}</p>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-purple-400 bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-800/40">
                        {ext.sources?.length || 1} fonte{(ext.sources?.length || 1) !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px] text-gray-600 truncate">{ext.repoName}</span>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {ext.isExtracted || ext.isInstalled ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-green-400 flex items-center gap-1 px-2.5 py-1 bg-green-950/60 border border-green-700/40 rounded-lg">
                          <CheckCircle size={12} /> Instalada
                        </span>
                        <button
                          onClick={() => handleUninstallExtracted(ext.pkg)}
                          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                          title="Remover"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleExtractApk(ext)}
                        loading={extractingPkgs.has(ext.pkg)}
                      >
                        <Download size={13} /> Instalar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {storeExtensions.length > 100 && (
            <p className="text-center text-xs text-gray-600 pt-2">
              Mostrando os primeiros 100 resultados. Use a barra de pesquisa para filtrar fontes específicas.
            </p>
          )}
        </div>
      )}

      {/* TAB 3: EXTENSION REPOSITORIES */}
      {activeTab === 'repos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Repositórios de extensões compatíveis com Tachiyomi, Suwayomi e Mihon. O OmniYomi extrai automaticamente os índices JSON e APKs desses links.
            </p>
            <Button size="sm" onClick={() => setShowAddRepoModal(true)}>
              <Plus size={14} /> Adicionar Repositório
            </Button>
          </div>

          {loadingRepos ? (
            <div className="flex justify-center py-20"><Loader size="lg" /></div>
          ) : (
            <div className="space-y-3">
              {repos.map(r => (
                <div key={r.url} className={cn('p-4 bg-[#1a1e29] border rounded-xl flex items-center gap-3', r.enabled ? 'border-[#2a3040]' : 'border-[#1a1f2e] opacity-60')}>
                  <div className="w-10 h-10 rounded-lg bg-purple-950/50 border border-purple-800/40 flex items-center justify-center text-purple-400 flex-shrink-0">
                    <Globe size={18} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-200 text-sm">{r.name}</p>
                    <p className="text-xs text-purple-400 font-mono truncate">{r.originalUrl || r.url}</p>
                    {r.lastSynced && (
                      <p className="text-[11px] text-gray-500 mt-0.5">Sincronizado {formatRelativeDate(r.lastSynced)}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRepo(r.url, r.enabled)}
                      className={cn('transition-colors cursor-pointer', r.enabled ? 'text-green-400 hover:text-green-300' : 'text-gray-600 hover:text-gray-400')}
                      title={r.enabled ? 'Desativar' : 'Ativar'}
                    >
                      {r.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>

                    <button
                      onClick={() => handleDeleteRepo(r.url)}
                      className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
                      title="Remover repositório"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Repo Modal */}
      <Modal
        open={showAddRepoModal}
        onClose={() => setShowAddRepoModal(false)}
        title="Adicionar Repositório de Extensões"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Insira o link para o arquivo <code className="text-purple-300">index.pb</code>, <code className="text-purple-300">index.json</code> ou <code className="text-purple-300">index.min.json</code> do repositório (Tachiyomi, Suwayomi, Mihon). O OmniYomi converte e extrai automaticamente do GitHub.
          </p>

          <Input
            label="URL do Repositório"
            value={newRepoUrl}
            onChange={e => setNewRepoUrl(e.target.value)}
            placeholder="https://raw.githubusercontent.com/Suwayomi/tachiyomi-extension/repo/index.min.json"
          />

          <Input
            label="Nome do Repositório (Opcional)"
            value={newRepoName}
            onChange={e => setNewRepoName(e.target.value)}
            placeholder="Ex: Suwayomi Repo Oficial"
          />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setShowAddRepoModal(false)}>Cancelar</Button>
            <Button onClick={handleAddRepo} loading={addingRepo} disabled={!newRepoUrl.trim()}>
              Extrair e Adicionar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
