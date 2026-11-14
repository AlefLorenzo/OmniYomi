import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, TrendingUp, Clock, Globe, ShieldCheck, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { CoverCard } from '../components/ui/CoverCard';
import { Button, Input, Loader, Empty } from '../components/ui/index';

type ViewMode = 'popular' | 'latest' | 'search';
type BrowseTab = 'source' | 'global';

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initSource = searchParams.get('source') || 'mangadex';

  const [activeTab, setActiveTab] = useState<BrowseTab>('source');
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState(initSource);
  const [viewMode, setViewMode] = useState<ViewMode>('popular');
  const [manga, setManga] = useState<any[]>([]);
  const [globalGroups, setGlobalGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const debounceTimer = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flaresolverr, setFlaresolverr] = useState<{ available: boolean; message: string } | null>(null);

  useEffect(() => {
    api.getSources().then(list => {
      const active = list.filter((s: any) => s.isEnabled && s.id !== 'local');
      setSources(active);
      if (active.length > 0 && !active.some(s => s.id === selectedSource)) {
        setSelectedSource(active[0].id);
      }
    });

    api.getFlareSolverrStatus().then(st => setFlaresolverr(st)).catch(() => {});
  }, []);

  const currentSourceInfo = sources.find(s => s.id === selectedSource);

  useEffect(() => {
    if (activeTab === 'source') {
      setManga([]);
      setPage(1);
      loadSourceCatalog(1);
    } else {
      loadGlobalSearch();
    }
  }, [selectedSource, viewMode, debouncedQ, activeTab]);

  const loadSourceCatalog = useCallback(async (p: number) => {
    if (!selectedSource) return;
    setLoading(true);
    setError(null);
    try {
      let result: any;
      if (viewMode === 'search' || debouncedQ) {
        result = await api.searchSource(selectedSource, debouncedQ, p);
      } else if (viewMode === 'latest') {
        result = await api.getLatest(selectedSource, p);
      } else {
        result = await api.getPopular(selectedSource, p);
      }
      setManga(result.manga || []);
      setHasNextPage(result.hasNextPage || false);
      setTotal(result.total || 0);
      setPage(p);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar catálogo da extensão');
    } finally {
      setLoading(false);
    }
  }, [selectedSource, viewMode, debouncedQ]);

  const loadGlobalSearch = useCallback(async () => {
    if (!debouncedQ.trim()) {
      setGlobalGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.deduplicatedSearch(debouncedQ);
      setGlobalGroups(res.groups || []);
    } catch (e: any) {
      setError(e.message || 'Erro na pesquisa global');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      setDebouncedQ(q);
      if (q.trim()) setViewMode('search');
      else setViewMode('popular');
    }, 400);
  };

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogo de Obras</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Títulos estritamente normalizados em PT-BR / Inglês com capas e capítulos completos
          </p>
        </div>

        {/* Global vs Per-Source Toggle */}
        <div className="flex gap-1 bg-[#1a1e29] border border-[#2a3040] rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('source')}
            className={`text-sm px-3.5 py-1.5 rounded transition-all font-medium cursor-pointer ${
              activeTab === 'source' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Navegar por Extensão
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`text-sm px-3.5 py-1.5 rounded transition-all font-medium cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'global' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Globe size={13} />
            <span>Pesquisa Global</span>
          </button>
        </div>
      </div>

      {/* Extension Info Banner (when per-source mode) */}
      {activeTab === 'source' && currentSourceInfo && (
        <div className="flex items-center justify-between bg-[#151923] border border-[#242b3b] px-4 py-3 rounded-xl">
          <div className="flex items-center gap-3">
            <img
              src={currentSourceInfo.iconUrl || '/assets/apk-icon.png'}
              alt={currentSourceInfo.name}
              className="w-8 h-8 rounded-lg object-contain bg-[#0e1118]"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/32x32/1a1e29/8b5cf6?text=?'; }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{currentSourceInfo.name}</span>
                <span className="text-xs bg-purple-900/40 text-purple-300 border border-purple-800/40 px-2 py-0.5 rounded uppercase font-semibold">
                  {currentSourceInfo.lang || 'ALL'}
                </span>
                <span className="text-xs text-gray-500">v{currentSourceInfo.version}</span>
              </div>
              <p className="text-xs text-gray-500 truncate max-w-md">{currentSourceInfo.baseUrl || 'Extensão Local / Integrada'}</p>
            </div>
          </div>

          {/* Cloudflare / FlareSolverr status pill */}
          {flaresolverr && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-400">
              {flaresolverr.available ? (
                <span className="flex items-center gap-1 text-emerald-400" title={flaresolverr.message}>
                  <ShieldCheck size={14} /> FlareSolverr Ativo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-500/80" title={flaresolverr.message}>
                  <ShieldAlert size={14} /> CF Fallback Ativo
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Source selector (only in source tab) */}
        {activeTab === 'source' && (
          <select
            value={selectedSource}
            onChange={e => { setSelectedSource(e.target.value); setSearchParams({ source: e.target.value }); }}
            className="bg-[#1a1e29] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 cursor-pointer min-w-[200px]"
          >
            {sources.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.lang?.toUpperCase() || 'ALL'})
              </option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="flex-1">
          <Input
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder={activeTab === 'global' ? 'Pesquisar em todas as extensões...' : `Pesquisar em ${currentSourceInfo?.name || 'extensão'}...`}
            leftIcon={<Search size={15} />}
          />
        </div>

        {/* Mode tabs (only in source tab) */}
        {activeTab === 'source' && (
          <div className="flex gap-1 bg-[#1a1e29] border border-[#2a3040] rounded-lg p-1">
            {([
              { mode: 'popular' as ViewMode, icon: TrendingUp, label: 'Populares' },
              { mode: 'latest' as ViewMode, icon: Clock, label: 'Recentes' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setDebouncedQ(''); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === mode && !debouncedQ
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TAB 1: PER-EXTENSION CATALOG */}
      {activeTab === 'source' && (
        <>
          {/* Results info */}
          {!loading && manga.length > 0 && (
            <p className="text-xs text-gray-400">
              {total > 0 ? `${total.toLocaleString()} obras encontradas` : `${manga.length} obras nesta página`}
              {debouncedQ && ` para "${debouncedQ}"`} em <span className="text-purple-400">{currentSourceInfo?.name}</span>
            </p>
          )}

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader size="lg" label="Carregando catálogo da extensão..." />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-red-400 text-sm">{error}</p>
              <Button variant="secondary" onClick={() => loadSourceCatalog(page)}>Tentar novamente</Button>
            </div>
          ) : manga.length === 0 ? (
            <Empty
              icon="🔍"
              title="Nenhuma obra encontrada"
              description={debouncedQ ? `Sem resultados para "${debouncedQ}" nesta extensão` : 'Tente outra fonte ou termo de busca'}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
              {manga.map(m => (
                <div key={m.id} className="flex flex-col">
                  <CoverCard
                    title={m.title}
                    coverUrl={m.coverUrl}
                    onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
                  />
                  {m.originalTitle && (
                    <span className="text-[11px] text-gray-500 italic truncate mt-1 px-1" title={`Título Original: ${m.originalTitle}`}>
                      {m.originalTitle}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && manga.length > 0 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadSourceCatalog(page - 1)}
                disabled={page <= 1 || loading}
              >
                <ChevronLeft size={16} /> Anterior
              </Button>
              <span className="text-sm text-gray-400 px-3">Página {page}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadSourceCatalog(page + 1)}
                disabled={!hasNextPage || loading}
              >
                Próxima <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}

      {/* TAB 2: GLOBAL SEARCH WITH DEDUPLICATION */}
      {activeTab === 'global' && (
        <>
          {!debouncedQ.trim() ? (
            <Empty
              icon="🌐"
              title="Pesquisa Global Unificada"
              description="Digite um título acima para pesquisar simultaneamente em todas as extensões e agrupar obras idênticas"
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader size="lg" label="Pesquisando em todas as extensões instaladas..." />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-red-400 text-sm">{error}</p>
              <Button variant="secondary" onClick={() => loadGlobalSearch()}>Tentar novamente</Button>
            </div>
          ) : globalGroups.length === 0 ? (
            <Empty
              icon="🔍"
              title="Nenhuma obra encontrada"
              description={`Nenhuma fonte retornou resultados para "${debouncedQ}"`}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                {globalGroups.length} obras únicas identificadas através das fontes ativas
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
                {globalGroups.map(grp => (
                  <div key={grp.canonicalSlug} className="flex flex-col group">
                    <CoverCard
                      title={grp.preferredTitle}
                      coverUrl={grp.coverUrl}
                      onClick={() => navigate(`/manga/${encodeURIComponent(grp.sources[0]?.mangaId)}`)}
                      badges={
                        <span className="text-[10px] bg-purple-900/90 text-purple-200 border border-purple-700/50 px-1.5 py-0.5 rounded font-medium shadow-sm">
                          {grp.sources.length} {grp.sources.length === 1 ? 'fonte' : 'fontes'}
                        </span>
                      }
                    />
                    <div className="mt-1 px-1">
                      {grp.originalTitle && (
                        <p className="text-[11px] text-gray-500 italic truncate" title={`Original: ${grp.originalTitle}`}>
                          {grp.originalTitle}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {grp.sources.slice(0, 2).map((s: any) => (
                          <span key={s.mangaId} className="text-[9px] bg-[#1a2130] text-gray-400 border border-[#2a354c] px-1.5 py-0.2 rounded truncate max-w-[90px]">
                            {s.sourceName || s.sourceId.split(':').pop()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
