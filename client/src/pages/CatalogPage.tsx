import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, TrendingUp, Clock, Filter } from 'lucide-react';
import { api } from '../lib/api';
import { CoverCard } from '../components/ui/CoverCard';
import { Button, Input, Loader, Empty, Select } from '../components/ui/index';

type ViewMode = 'popular' | 'latest' | 'search';

export function CatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initSource = searchParams.get('source') || 'mangadex';

  const [sources, setSources] = useState<any[]>([]);
  const [selectedSource, setSelectedSource] = useState(initSource);
  const [viewMode, setViewMode] = useState<ViewMode>('popular');
  const [manga, setManga] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const debounceTimer = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSources().then(list => setSources(list.filter((s: any) => s.isEnabled && s.id !== 'local')));
  }, []);

  useEffect(() => {
    setManga([]);
    setPage(1);
    loadPage(1);
  }, [selectedSource, viewMode, debouncedQ]);

  const loadPage = useCallback(async (p: number) => {
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
      setError(e.message || 'Erro ao carregar catálogo');
    } finally {
      setLoading(false);
    }
  }, [selectedSource, viewMode, debouncedQ]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      setDebouncedQ(q);
      if (q.trim()) setViewMode('search');
      else setViewMode('popular');
    }, 500);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Catálogo</h1>
        <p className="text-sm text-gray-500 mt-0.5">Explore obras das fontes disponíveis</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Source selector */}
        <select
          value={selectedSource}
          onChange={e => { setSelectedSource(e.target.value); setSearchParams({ source: e.target.value }); }}
          className="bg-[#1a1e29] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 cursor-pointer min-w-[180px]"
        >
          {sources.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Search */}
        <div className="flex-1">
          <Input
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Pesquisar obras..."
            leftIcon={<Search size={15} />}
          />
        </div>

        {/* Mode tabs */}
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
      </div>

      {/* Results info */}
      {!loading && manga.length > 0 && (
        <p className="text-xs text-gray-500">
          {total > 0 ? `${total.toLocaleString()} resultados` : `${manga.length} resultados`}
          {debouncedQ && ` para "${debouncedQ}"`}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader size="lg" label="Carregando catálogo..." />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-red-400 text-sm">{error}</p>
          <Button variant="secondary" onClick={() => loadPage(page)}>Tentar novamente</Button>
        </div>
      ) : manga.length === 0 ? (
        <Empty
          icon="🔍"
          title="Nenhuma obra encontrada"
          description={debouncedQ ? `Sem resultados para "${debouncedQ}"` : 'Tente outra fonte ou categoria'}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4">
          {manga.map(m => (
            <CoverCard
              key={m.id}
              title={m.title}
              coverUrl={m.coverUrl}
              onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && (hasNextPage || page > 1) && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => loadPage(page - 1)}
          >
            <ChevronLeft size={16} />
            Anterior
          </Button>

          <span className="text-sm text-gray-400">Página {page}</span>

          <Button
            variant="secondary"
            size="sm"
            disabled={!hasNextPage}
            onClick={() => loadPage(page + 1)}
          >
            Próxima
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
