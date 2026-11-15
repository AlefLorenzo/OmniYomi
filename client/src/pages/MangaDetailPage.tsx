import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  BookOpen, Download, Heart, HeartOff, RefreshCw, ArrowLeft,
  CheckSquare, Square, Star, User, Palette, ChevronDown, ChevronUp,
  CheckCircle, Circle, HardDrive, Loader2, BookmarkPlus, BookmarkCheck
} from 'lucide-react';
import { api, resolveApiUrl } from '../lib/api';
import { Button, Loader, ProgressBar } from '../components/ui/index';
import { Badge } from '../components/ui/CoverCard';
import { formatRelativeDate, statusLabel, statusColor, cn } from '../lib/utils';
import { useToast } from '../components/ui/ToastProvider';
import { useWs } from '../lib/ws';

export function MangaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { show } = useToast();
  const { subscribe } = useWs();
  const mangaId = decodeURIComponent(id || '');

  const sourceIdFromNav = searchParams.get('sourceId') || (location.state as any)?.sourceId || '';
  const [currentSourceId, setCurrentSourceId] = useState(sourceIdFromNav);

  const [manga, setManga] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [sortAsc, setSortAsc] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterDownloaded, setFilterDownloaded] = useState(false);
  const [inLibrary, setInLibrary] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  useEffect(() => {
    if (!mangaId) return;
    loadManga();

    const unsubs = [
      subscribe('DOWNLOAD_COMPLETED', (msg: any) => {
        const chId = msg?.data?.chapterId || msg?.chapterId;
        if (chId) {
          setChapters(prev => prev.map(c => c.id === chId ? { ...c, isDownloaded: true } : c));
          show('Capítulo baixado e disponível offline! 📥', 'success');
        }
      }),
      subscribe('DOWNLOAD_PROGRESS', (msg: any) => {
        const chId = msg?.data?.chapterId || msg?.chapterId;
        const status = msg?.data?.status || msg?.status;
        if (chId && status === 'COMPLETED') {
          setChapters(prev => prev.map(c => c.id === chId ? { ...c, isDownloaded: true } : c));
        }
      }),
    ];

    return () => unsubs.forEach(u => u());
  }, [mangaId, currentSourceId]);

  async function loadManga() {
    setLoading(true);
    setError(null);
    try {
      const mangaData = await api.getManga(mangaId, currentSourceId);
      const effectiveSourceId = mangaData.sourceId || currentSourceId;
      if (effectiveSourceId && effectiveSourceId !== currentSourceId) {
        setCurrentSourceId(effectiveSourceId);
      }
      const chaptersData = await api.getChapters(mangaId, effectiveSourceId);
      setManga(mangaData);
      setChapters(chaptersData || []);
      setInLibrary(mangaData.inLibrary || false);
      setIsFavorite(Boolean(mangaData.isFavorite || mangaData.categoryId === 'favorites'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setChaptersLoading(true);
    try {
      const res = await api.refreshManga(mangaId, currentSourceId);
      setChapters(res.chapters || await api.getChapters(mangaId, currentSourceId));
      show('Capítulos atualizados!', 'success');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setChaptersLoading(false);
    }
  }

  async function handleLibraryToggle() {
    setLibraryLoading(true);
    try {
      const nextLib = !inLibrary;
      await api.setInLibrary(mangaId, nextLib, isFavorite ? 'favorites' : 'default', manga ? { ...manga, id: mangaId, sourceId: currentSourceId || manga.sourceId, sourceMangaId: manga.url || mangaId, chapters } : undefined);
      setInLibrary(nextLib);
      show(nextLib ? 'Adicionado à biblioteca!' : 'Removido da biblioteca', 'success');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setLibraryLoading(false);
    }
  }

  async function handleFavoriteToggle() {
    setFavoriteLoading(true);
    try {
      const nextFav = !isFavorite;
      await api.toggleFavorite(mangaId, nextFav, manga ? { ...manga, id: mangaId, sourceId: currentSourceId || manga.sourceId, sourceMangaId: manga.url || mangaId, chapters } : undefined);
      setIsFavorite(nextFav);
      if (nextFav) setInLibrary(true);
      show(nextFav ? 'Adicionado aos Favoritos! ❤️' : 'Removido dos Favoritos', 'success');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setFavoriteLoading(false);
    }
  }

  async function handleDownloadChapter(chapterId: string) {
    setDownloading(prev => new Set([...prev, chapterId]));
    try {
      await api.enqueueDownload(chapterId, currentSourceId, mangaId);
      setChapters(prev => prev.map(c => c.id === chapterId ? { ...c, isDownloaded: true } : c));
      show('Capítulo baixado e disponível para leitura offline! 📥', 'success');
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setDownloading(prev => { const n = new Set(prev); n.delete(chapterId); return n; });
    }
  }

  async function handleDownloadSelected() {
    const ids = [...selectedChapters];
    if (ids.length === 0) return;
    try {
      const res = await api.enqueueBatch(ids, currentSourceId, mangaId);
      setChapters(prev => prev.map(c => ids.includes(c.id) ? { ...c, isDownloaded: true } : c));
      show(`${res.enqueuedCount || ids.length} capítulos baixados para leitura offline! 📥`, 'success');
      setSelectedChapters(new Set());
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  async function handleMarkReadSelected(isRead: boolean) {
    const ids = [...selectedChapters];
    if (ids.length === 0) return;
    try {
      await api.markChaptersRead(ids, isRead);
      setChapters(prev => prev.map(c => ids.includes(c.id) ? { ...c, isRead } : c));
      setSelectedChapters(new Set());
      show(`${ids.length} capítulos marcados como ${isRead ? 'lidos' : 'não lidos'}`, 'success');
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  const [showRangePicker, setShowRangePicker] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState('50');

  function selectRange(from: number, to: number) {
    const matched = chapters.filter(c => c.chapterNumber >= from && c.chapterNumber <= to);
    setSelectedChapters(new Set(matched.map(c => c.id)));
    show(`${matched.length} capítulos selecionados (intervalo ${from} a ${to})`, 'info');
  }

  function toggleSelect(id: string) {
    setSelectedChapters(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selectedChapters.size === filteredChapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(filteredChapters.map(c => c.id)));
    }
  }

  let filteredChapters = [...chapters];
  if (filterUnread) filteredChapters = filteredChapters.filter(c => !c.isRead);
  if (filterDownloaded) filteredChapters = filteredChapters.filter(c => c.isDownloaded);
  if (sortAsc) filteredChapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  else filteredChapters.sort((a, b) => b.chapterNumber - a.chapterNumber);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader size="lg" label="Carregando obra..." /></div>;
  }

  if (error || !manga) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-400">{error || 'Obra não encontrada'}</p>
        <Button variant="secondary" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const firstUnread = filteredChapters.filter(c => !c.isRead).at(-1);
  const nextChapter = firstUnread || filteredChapters[0];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-200 transition-colors"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Hero section */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Cover */}
        <div className="flex-shrink-0 self-start">
          <div className="w-40 sm:w-48 rounded-xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/5 bg-[#121620] relative aspect-[2/3] flex items-center justify-center">
            {manga.coverUrl ? (
              <img
                src={resolveApiUrl(
                  manga.coverUrl.startsWith('http') && !manga.coverUrl.startsWith('/api/proxy')
                    ? `/api/proxy/image?url=${encodeURIComponent(manga.coverUrl)}`
                    : manga.coverUrl
                )}
                alt={manga.title}
                className="w-full h-full object-cover"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                  const fb = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                  if (fb) fb.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-[#131722]"
              style={{ display: manga.coverUrl ? 'none' : 'flex' }}
            >
              <span className="text-3xl mb-1">📖</span>
              <span className="text-xs text-gray-400 font-medium">{manga.title}</span>
              <span className="text-[10px] text-gray-600 mt-1 uppercase">Capa Pendente</span>
            </div>
            {isFavorite && (
              <div className="absolute top-2 right-2">
                <Badge variant="red">❤️ Favorito</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-[#242c3d] text-purple-300 border border-purple-800/40 px-2 py-0.5 rounded font-medium">
                Fonte: {manga.sourceName || manga.sourceId}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">{manga.title}</h1>
            {manga.originalTitle && (
              <p className="text-sm text-gray-400 italic">
                <span className="text-gray-500 font-normal">Título original:</span> {manga.originalTitle}
              </p>
            )}
          </div>

          {manga.altTitles?.length > 0 && (
            <p className="text-xs text-gray-500 truncate" title={manga.altTitles.join(', ')}>
              <span className="text-gray-600">Também conhecido como:</span> {manga.altTitles.slice(0, 3).join(' • ')}
            </p>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            {manga.author && (
              <span className="flex items-center gap-1.5 text-gray-400">
                <User size={13} className="text-purple-400" />
                {manga.author}
              </span>
            )}
            {manga.artist && manga.artist !== manga.author && (
              <span className="flex items-center gap-1.5 text-gray-400">
                <Palette size={13} className="text-pink-400" />
                {manga.artist}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${statusColor[manga.status] || 'text-gray-400'}`}>
              {statusLabel[manga.status] || manga.status}
            </span>
            <span className="text-gray-600">•</span>
            <span className="text-sm text-gray-400">{manga.totalChapters} capítulos</span>
            {manga.unreadCount > 0 && (
              <>
                <span className="text-gray-600">•</span>
                <span className="text-sm text-purple-400">{manga.unreadCount} não lidos</span>
              </>
            )}
          </div>

          {/* Genres */}
          {manga.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manga.genres.slice(0, 10).map((g: string) => (
                <span key={g} className="text-[11px] px-2 py-0.5 bg-[#1a1e29] border border-[#2a3040] rounded-full text-gray-400">
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {manga.description && (
            <div>
              <p className={cn('text-sm text-gray-400 leading-relaxed', !descExpanded && 'line-clamp-3')}>
                {manga.description}
              </p>
              {manga.description.length > 200 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="text-xs text-purple-400 hover:text-purple-300 mt-1 flex items-center gap-1"
                >
                  {descExpanded ? <><ChevronUp size={12} /> Ver menos</> : <><ChevronDown size={12} /> Ver mais</>}
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {nextChapter && (
              <Button onClick={() => navigate(`/read/${encodeURIComponent(nextChapter.id)}?sourceId=${encodeURIComponent(currentSourceId || '')}&mangaId=${encodeURIComponent(mangaId)}`)} size="md">
                <BookOpen size={16} />
                {firstUnread ? 'Continuar Leitura' : 'Ler do início'}
              </Button>
            )}

            <Button
              variant={isFavorite ? 'secondary' : 'outline'}
              onClick={handleFavoriteToggle}
              loading={favoriteLoading}
              className={isFavorite ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30' : 'text-rose-400 border-rose-500/30 hover:bg-rose-500/10'}
            >
              <Heart size={16} className={isFavorite ? 'fill-rose-500 text-rose-500' : ''} />
              {isFavorite ? 'Nos Favoritos' : 'Favoritar'}
            </Button>

            <Button
              variant={inLibrary ? 'secondary' : 'outline'}
              onClick={handleLibraryToggle}
              loading={libraryLoading}
            >
              {inLibrary ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
              {inLibrary ? 'Na Biblioteca' : 'Adicionar à Biblioteca'}
            </Button>

            <Button variant="secondary" onClick={handleRefresh} loading={chaptersLoading}>
              <RefreshCw size={15} />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Chapter list */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-base font-semibold text-gray-200">
            Capítulos ({filteredChapters.length})
          </h2>

          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setFilterUnread(!filterUnread)}
              className={cn('text-xs px-2.5 py-1.5 rounded-lg border transition-colors', filterUnread ? 'bg-purple-700 border-purple-500 text-white' : 'border-[#2a3040] text-gray-500 hover:text-gray-200')}
            >
              Não lidos
            </button>
            <button
              onClick={() => setFilterDownloaded(!filterDownloaded)}
              className={cn('text-xs px-2.5 py-1.5 rounded-lg border transition-colors', filterDownloaded ? 'bg-green-800 border-green-600 text-white' : 'border-[#2a3040] text-gray-500 hover:text-gray-200')}
            >
              Baixados
            </button>
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-[#2a3040] text-gray-500 hover:text-gray-200 transition-colors flex items-center gap-1"
            >
              {sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {sortAsc ? 'Crescente' : 'Decrescente'}
            </button>
          </div>
        </div>

        {/* Bulk actions bar */}
        {selectedChapters.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg mb-3">
            <span className="text-sm text-purple-300 font-medium">{selectedChapters.size} selecionados</span>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="secondary" onClick={() => handleMarkReadSelected(true)}>
                <CheckCircle size={13} /> Marcar lidos
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleMarkReadSelected(false)}>
                <Circle size={13} /> Marcar não lidos
              </Button>
              <Button size="sm" onClick={handleDownloadSelected}>
                <Download size={13} /> Baixar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedChapters(new Set())}>✕</Button>
            </div>
          </div>
        )}

        {/* Selection & Range bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 mb-2 bg-[#141822] border border-[#1f2535] rounded-lg">
          <div className="flex items-center gap-3">
            <button onClick={toggleSelectAll} className="text-gray-500 hover:text-purple-400 transition-colors flex items-center gap-1.5 text-xs">
              {selectedChapters.size === filteredChapters.length && filteredChapters.length > 0
                ? <CheckSquare size={16} className="text-purple-400" />
                : <Square size={16} />}
              <span>Selecionar todos ({filteredChapters.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Intervalos:</span>
            <button
              onClick={() => selectRange(1, 50)}
              className="text-xs px-2 py-1 rounded bg-[#1f2535] hover:bg-purple-900/40 hover:text-purple-300 text-gray-300 transition-colors"
            >
              1 a 50
            </button>
            <button
              onClick={() => selectRange(51, 100)}
              className="text-xs px-2 py-1 rounded bg-[#1f2535] hover:bg-purple-900/40 hover:text-purple-300 text-gray-300 transition-colors"
            >
              51 a 100
            </button>
            <button
              onClick={() => selectRange(101, 200)}
              className="text-xs px-2 py-1 rounded bg-[#1f2535] hover:bg-purple-900/40 hover:text-purple-300 text-gray-300 transition-colors"
            >
              101 a 200
            </button>
            <button
              onClick={() => setShowRangePicker(!showRangePicker)}
              className="text-xs px-2 py-1 rounded border border-[#2a3040] hover:border-purple-500 text-purple-400 transition-colors"
            >
              Personalizado...
            </button>
          </div>
        </div>

        {/* Custom range picker form */}
        {showRangePicker && (
          <div className="flex items-center gap-2 p-3 mb-2 bg-[#1a1e29] border border-[#2a3040] rounded-lg text-xs">
            <span className="text-gray-400">Selecionar do capítulo:</span>
            <input
              type="number"
              value={rangeFrom}
              onChange={e => setRangeFrom(e.target.value)}
              className="w-16 bg-[#131720] border border-[#2a3040] rounded px-2 py-1 text-center text-white"
            />
            <span className="text-gray-400">até o:</span>
            <input
              type="number"
              value={rangeTo}
              onChange={e => setRangeTo(e.target.value)}
              className="w-16 bg-[#131720] border border-[#2a3040] rounded px-2 py-1 text-center text-white"
            />
            <Button
              size="sm"
              onClick={() => selectRange(parseFloat(rangeFrom) || 0, parseFloat(rangeTo) || 0)}
            >
              Aplicar Intervalo
            </Button>
          </div>
        )}

        {/* Chapter items */}
        <div className="border border-[#1f2535] rounded-xl overflow-hidden divide-y divide-[#1a1e29]">
          {filteredChapters.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">Nenhum capítulo encontrado</div>
          ) : (
            filteredChapters.map(ch => (
              <div
                key={ch.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-3 hover:bg-[#1a1e29] transition-colors group',
                  ch.isRead && 'opacity-60'
                )}
              >
                {/* Select checkbox */}
                <button
                  onClick={e => { e.stopPropagation(); toggleSelect(ch.id); }}
                  className="text-gray-600 hover:text-purple-400 transition-colors flex-shrink-0"
                >
                  {selectedChapters.has(ch.id)
                    ? <CheckSquare size={16} className="text-purple-400" />
                    : <Square size={16} />}
                </button>

                {/* Chapter info (clickable) */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/read/${encodeURIComponent(ch.id)}?sourceId=${encodeURIComponent(currentSourceId || '')}&mangaId=${encodeURIComponent(mangaId)}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {ch.title || `Capítulo ${ch.chapterNumber}`}
                    </span>
                      {ch.isDownloaded && (
                      <span title="Baixado"><HardDrive size={12} className="text-green-500 flex-shrink-0" /></span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ch.releaseDate && (
                      <span className="text-xs text-gray-600">{ch.releaseDate}</span>
                    )}
                    {ch.scanlator && (
                      <span className="text-xs text-gray-600">• {ch.scanlator}</span>
                    )}
                    {ch.isRead && ch.lastPageRead > 0 && (
                      <span className="text-xs text-purple-500">Pág. {ch.lastPageRead}</span>
                    )}
                  </div>
                </div>

                {/* Download button */}
                {!ch.isDownloaded && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDownloadChapter(ch.id); }}
                    disabled={downloading.has(ch.id)}
                    className="opacity-80 sm:opacity-0 sm:group-hover:opacity-100 text-gray-400 hover:text-purple-400 transition-all disabled:opacity-50 flex-shrink-0 p-1"
                    title="Baixar capítulo para ler offline"
                  >
                    {downloading.has(ch.id)
                      ? <Loader2 size={16} className="animate-spin" />
                      : <Download size={16} />}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
