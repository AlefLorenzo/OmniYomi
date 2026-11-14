import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, RefreshCw, Clock, TrendingUp, Library, Download, Heart, ArrowRight, Play } from 'lucide-react';
import { api } from '../lib/api';
import { CoverCard } from '../components/ui/CoverCard';
import { Button, Loader, Empty } from '../components/ui/index';
import { formatRelativeDate, truncate } from '../lib/utils';

export function HomePage() {
  const navigate = useNavigate();
  const [recentHistory, setRecentHistory] = useState<any[]>([]);
  const [libraryUpdates, setLibraryUpdates] = useState<any[]>([]);
  const [popularManga, setPopularManga] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ library: 0, downloads: 0, history: 0 });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [history, library, popular] = await Promise.all([
        api.getHistory(6),
        api.getLibrary(),
        api.getPopular('mangadex', 1).catch(() => ({ manga: [] })),
      ]);

      setRecentHistory(history);
      setLibraryUpdates(library.filter((m: any) => m.unreadCount > 0).slice(0, 10));
      setPopularManga(popular.manga?.slice(0, 10) || []);

      const downloads = await api.getDownloads().catch(() => []);
      setStats({
        library: library.length,
        downloads: downloads.length,
        history: history.length,
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="lg" label="Carregando OmniYomi..." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Início</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bem-vindo ao OmniYomi — sua plataforma completa de leitura</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadAll}>
          <RefreshCw size={14} />
          Atualizar
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Library, label: 'Na biblioteca', value: stats.library, color: 'text-purple-400', bg: 'bg-purple-900/20', path: '/library' },
          { icon: Download, label: 'Downloads', value: stats.downloads, color: 'text-blue-400', bg: 'bg-blue-900/20', path: '/downloads' },
          { icon: Clock, label: 'Histórico', value: stats.history, color: 'text-green-400', bg: 'bg-green-900/20', path: '/history' },
        ].map(s => (
          <div
            key={s.label}
            className={`${s.bg} rounded-xl p-4 border border-[#2a3040] cursor-pointer hover:border-purple-500/30 transition-colors`}
            onClick={() => navigate(s.path)}
          >
            <div className="flex items-center gap-3">
              <s.icon size={22} className={s.color} />
              <div>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Continue reading */}
      {recentHistory.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
              <Play size={16} className="text-purple-400" />
              Continue Lendo
            </h2>
            <button
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              onClick={() => navigate('/history')}
            >
              Ver tudo <ArrowRight size={12} />
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {recentHistory.map(item => (
              <div
                key={item.id}
                className="flex-shrink-0 w-32 cursor-pointer group"
                onClick={() => navigate(`/manga/${encodeURIComponent(item.mangaId)}`)}
              >
                <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-[#1a1e29]">
                  <img
                    src={item.coverUrl}
                    alt={item.mangaTitle}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).src = `https://placehold.co/300x450/1a1e29/8b5cf6?text=${encodeURIComponent(item.mangaTitle.slice(0, 10))}`; }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                    <p className="text-[10px] text-purple-300 font-medium">Cap. {item.chapterNumber}</p>
                    <p className="text-[9px] text-gray-400">Pág. {item.page}/{item.totalPages || '?'}</p>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-gray-300 leading-tight truncate group-hover:text-purple-300 transition-colors">
                  {item.mangaTitle}
                </p>
                <p className="text-[10px] text-gray-600">{formatRelativeDate(item.readAt)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Library updates (unread) */}
      {libraryUpdates.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
              <BookOpen size={16} className="text-green-400" />
              Capítulos Não Lidos
            </h2>
            <button
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              onClick={() => navigate('/library')}
            >
              Biblioteca <ArrowRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {libraryUpdates.map(m => (
              <CoverCard
                key={m.id}
                title={m.title}
                coverUrl={m.coverUrl}
                onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
                badges={
                  m.unreadCount > 0 ? (
                    <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                      {m.unreadCount}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Popular manga */}
      {popularManga.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-200 flex items-center gap-2">
              <TrendingUp size={16} className="text-yellow-400" />
              Populares no MangaDex
            </h2>
            <button
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              onClick={() => navigate('/catalog?source=mangadex')}
            >
              Ver catálogo <ArrowRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {popularManga.map(m => (
              <CoverCard
                key={m.id}
                title={m.title}
                coverUrl={m.coverUrl}
                onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
              />
            ))}
          </div>
        </section>
      )}

      {recentHistory.length === 0 && libraryUpdates.length === 0 && (
        <Empty
          icon="📚"
          title="Bem-vindo ao OmniYomi!"
          description="Comece adicionando obras à sua biblioteca ou explorando o catálogo de fontes disponíveis."
          action={
            <div className="flex gap-3">
              <Button onClick={() => navigate('/catalog')}>
                <BookOpen size={16} /> Explorar Catálogo
              </Button>
              <Button variant="secondary" onClick={() => navigate('/sources')}>
                <Globe size={16} /> Ver Fontes
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}

function Globe({ size, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
