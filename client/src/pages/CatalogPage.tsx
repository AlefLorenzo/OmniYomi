import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, TrendingUp, Clock, Globe, ShieldCheck, ShieldAlert, Sparkles, Filter, Layers } from 'lucide-react';
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

  // Troca de fonte com limpeza imediata de estado para garantir isolamento absoluto
  const handleSelectSource = (sourceId: string) => {
    if (sourceId === selectedSource) return;
    setManga([]);
    setTotal(0);
    setPage(1);
    setSelectedSource(sourceId);
    setSearchParams({ source: sourceId });
  };

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

      // Garantir que todas as obras retornadas pertençam estritamente à extensão selecionada
      const validatedManga = (result.manga || []).filter((m: any) => m.sourceId === selectedSource);
      setManga(validatedManga);
      setHasNextPage(result.hasNextPage || false);
      setTotal(result.total || validatedManga.length);
      setPage(p);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar catálogo da extensão');
      setManga([]);
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
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogo de Obras</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Obras exclusivas por extensão • Títulos em PT-BR / Inglês • Capas verificadas
          </p>
        </div>

        {/* Global vs Per-Source Toggle */}
        <div className="flex gap-1 bg-[#1a1e29] border border-[#2a3040] rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('source')}
            className={`text-sm px-3.5 py-1.5 rounded transition-all font-medium cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'source' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers size={14} />
            <span>Por Extensão</span>
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`text-sm px-3.5 py-1.5 rounded transition-all font-medium cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'global' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Globe size={14} />
            <span>Pesquisa Global</span>
          </button>
        </div>
      </div>

      {/* EXTENSION SELECTOR SHELF (Carrossel / Grid de Extensões Instaladas) */}
      {activeTab === 'source' && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
            <span>Selecione a Extensão ({sources.length} ativas)</span>
            <button
              onClick={() => navigate('/sources')}
              className="text-xs text-purple-400 hover:text-purple-300 normal-case font-medium flex items-center gap-1 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-700/40"
            >
              <Sparkles size={11} /> + Extensões & Loja
            </button>
          </label>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {sources.map(src => {
              const isSelected = src.id === selectedSource;
              return (
                <button
                  key={src.id}
                  onClick={() => handleSelectSource(src.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-left transition-all flex-shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-purple-900/30 border-purple-500 shadow-md ring-1 ring-purple-500/50 text-white'
                      : 'bg-[#151923] border-[#242b3b] text-gray-300 hover:border-gray-600 hover:bg-[#1a202d]'
                  }`}
                >
                  <img
                    src={src.iconUrl || '/assets/apk-icon.png'}
                    alt={src.name}
                    className="w-7 h-7 rounded-lg object-contain bg-[#0e1118]"
                    onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/28x28/1a1e29/8b5cf6?text=?'; }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold leading-tight line-clamp-1">{src.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded uppercase font-bold ${
                        isSelected ? 'bg-purple-500 text-white' : 'bg-[#242b3b] text-gray-400'
                      }`}>
                        {src.lang || 'ALL'}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500">v{src.version}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Extension Info Banner */}
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
              <p className="text-xs text-gray-500 truncate max-w-md">{currentSourceInfo.baseUrl || 'Fonte Nativa / Integrada'}</p>
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
                  <ShieldAlert size={14} /> CF Protegido
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Controls: Search and Mode tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1">
          <Input
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder={activeTab === 'global' ? 'Pesquisar em todas as extensões...' : `Pesquisar em ${currentSourceInfo?.name || 'extensão'}...`}
            leftIcon={<Search size={15} />}
          />
        </div>

        {/* Mode tabs (only in per-source tab) */}
        {activeTab === 'source' && (
          <div className="flex gap-1 bg-[#1a1e29] border border-[#2a3040] rounded-lg p-1">
            {([
              { mode: 'popular' as ViewMode, icon: TrendingUp, label: 'Populares' },
              { mode: 'latest' as ViewMode, icon: Clock, label: 'Recentes' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setDebouncedQ(''); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer ${
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
              {total > 0 ? `${total.toLocaleString()} obras` : `${manga.length} obras`} em <strong className="text-purple-300">{currentSourceInfo?.name}</strong>
              {debouncedQ && ` para "${debouncedQ}"`}
            </p>
          )}

          {/* Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader size="lg" label={`Consultando ${currentSourceInfo?.name || 'extensão'}...`} />
              <p className="text-xs text-gray-500">Buscando obras exclusivas desta extensão</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <p className="text-red-400 text-sm">{error}</p>
              <Button variant="secondary" onClick={() => loadSourceCatalog(page)}>Tentar novamente</Button>
            </div>
          ) : manga.length === 0 ? (
            <Empty
              icon="📦"
              title={`Nenhuma obra retornada por "${currentSourceInfo?.name || 'esta extensão'}"`}
              description={
                debouncedQ
                  ? `Sem resultados para "${debouncedQ}" nesta extensão.`
                  : currentSourceInfo?.baseUrl
                    ? `O site (${currentSourceInfo.baseUrl}) pode estar protegido por Cloudflare ou temporariamente inacessível. Tente outra extensão ou pesquise globalmente.`
                    : 'Esta extensão não possui catálogo público ou requer configuração local.'
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {manga.map(m => (
                <div key={m.id} className="flex flex-col">
                  <CoverCard
                    title={m.title}
                    coverUrl={m.coverUrl}
                    onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
                  />
                  <div className="mt-1 px-1">
                    {m.originalTitle && (
                      <span className="text-[11px] text-gray-500 italic truncate block" title={`Original: ${m.originalTitle}`}>
                        {m.originalTitle}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600 block truncate">
                      Fonte: {m.sourceName || currentSourceInfo?.name}
                    </span>
                  </div>
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
              description="Digite um título no campo de busca para consultar todas as extensões e agrupar obras idênticas"
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
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
