import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Menu, X, ZoomIn, ZoomOut, RotateCcw,
  ArrowLeft, Maximize, Minimize, List, BookOpen
} from 'lucide-react';
import { api, resolveApiUrl } from '../lib/api';
import { Loader } from '../components/ui/index';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/utils';

type ReaderMode = 'paged_rtl' | 'paged_ltr' | 'vertical_webtoon';
type FitMode = 'fit_width' | 'fit_height' | 'fit_screen' | 'original';

export function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { show } = useToast();
  const id = decodeURIComponent(chapterId || '');

  const sourceId = searchParams.get('sourceId') || (location.state as any)?.sourceId || '';
  const mangaIdFromNav = searchParams.get('mangaId') || (location.state as any)?.mangaId || '';

  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [readerMode, setReaderMode] = useState<ReaderMode>('vertical_webtoon');
  const [fitMode, setFitMode] = useState<FitMode>('fit_width');
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [pageSpacing, setPageSpacing] = useState(4);
  const [chapter, setChapter] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [autoMarkPercent] = useState(85);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const markedReadRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    loadReader();
  }, [id, sourceId, mangaIdFromNav]);

  async function loadReader() {
    setLoading(true);
    setError(null);
    markedReadRef.current = false;

    try {
      // Load settings for default reader mode
      const settings = await api.getSettings().catch(() => null);
      if (settings?.defaultReaderMode) setReaderMode(settings.defaultReaderMode);
      if (settings?.defaultFitMode) setFitMode(settings.defaultFitMode);
      if (settings?.pageSpacing !== undefined) setPageSpacing(settings.pageSpacing);

      // Determine mangaId
      let mangaId = mangaIdFromNav;
      if (!mangaId) {
        const parts = id.split(':');
        if (id.startsWith('apk:') && parts.length >= 4) {
          mangaId = parts.slice(0, parts.length - 1).join(':');
        } else if (parts.length >= 2) {
          mangaId = `${parts[0]}:${parts[1]}`;
        }
      }

      // Load pages (checking offline downloaded storage first!)
      const pageData = await api.getPages(id, sourceId, mangaId);
      setPages(pageData.pages || []);
      setTotalPages(pageData.totalPages || pageData.pages?.length || 0);
      setIsOffline(Boolean(pageData.isOffline));

      // Try to load chapter info + sibling chapters
      if (mangaId) {
        const [chList] = await Promise.all([api.getChapters(mangaId, sourceId).catch(() => [])]);
        setChapters(chList || []);
        const thisChapter = chList?.find((c: any) => c.id === id);
        setChapter(thisChapter || null);

        // Restore last page
        if (thisChapter?.lastPageRead > 0) {
          setCurrentPage(thisChapter.lastPageRead);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Track scroll position in webtoon mode
  const handleScroll = useCallback(() => {
    if (readerMode !== 'vertical_webtoon') return;
    if (!containerRef.current) return;

    const container = containerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollPercent = ((scrollTop + clientHeight) / scrollHeight) * 100;

    // Determine current visible page by checking image positions
    let visiblePage = 1;
    for (let i = 0; i < pageRefs.current.length; i++) {
      const img = pageRefs.current[i];
      if (!img) continue;
      const rect = img.getBoundingClientRect();
      if (rect.top <= clientHeight * 0.5) {
        visiblePage = i + 1;
      }
    }
    setCurrentPage(visiblePage);

    // Auto-save progress
    if (totalPages > 0) {
      api.updateProgress(id, visiblePage, totalPages, scrollPercent >= autoMarkPercent)
        .catch(() => {});

      if (scrollPercent >= autoMarkPercent && !markedReadRef.current) {
        markedReadRef.current = true;
      }
    }
  }, [readerMode, id, totalPages, autoMarkPercent]);

  // For paged mode: save progress when page changes
  useEffect(() => {
    if (readerMode !== 'vertical_webtoon' && totalPages > 0 && !loading) {
      const isRead = currentPage >= Math.ceil(totalPages * (autoMarkPercent / 100));
      api.updateProgress(id, currentPage, totalPages, isRead).catch(() => {});
    }
  }, [currentPage, readerMode, totalPages, loading]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readerMode === 'vertical_webtoon') return;
      if (e.key === 'ArrowRight' || e.key === 'd') nextPage();
      if (e.key === 'ArrowLeft' || e.key === 'a') prevPage();
      if (e.key === 'Escape') setShowMenu(false);
      if (e.key === 'f') toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [readerMode, currentPage, totalPages]);

  const nextPage = () => {
    if (readerMode === 'paged_rtl' || readerMode === 'paged_ltr') {
      if (currentPage < totalPages) setCurrentPage(p => p + 1);
      else goNextChapter();
    }
  };

  const prevPage = () => {
    if (readerMode === 'paged_rtl' || readerMode === 'paged_ltr') {
      if (currentPage > 1) setCurrentPage(p => p - 1);
      else goPrevChapter();
    }
  };

  const getAdjacentChapters = () => {
    if (!chapter || chapters.length === 0) return { prev: null, next: null };
    const sortedByNum = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    const idx = sortedByNum.findIndex(c => c.id === id);
    return {
      prev: idx > 0 ? sortedByNum[idx - 1] : null,
      next: idx < sortedByNum.length - 1 ? sortedByNum[idx + 1] : null,
    };
  };

  const { prev: prevChapter, next: nextChapter } = getAdjacentChapters();

  const goNextChapter = () => {
    if (nextChapter) navigate(`/read/${encodeURIComponent(nextChapter.id)}?sourceId=${encodeURIComponent(sourceId)}&mangaId=${encodeURIComponent(mangaIdFromNav)}`);
    else show('Você chegou ao último capítulo!', 'info');
  };

  const goPrevChapter = () => {
    if (prevChapter) navigate(`/read/${encodeURIComponent(prevChapter.id)}?sourceId=${encodeURIComponent(sourceId)}&mangaId=${encodeURIComponent(mangaIdFromNav)}`);
    else show('Você está no primeiro capítulo!', 'info');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const getFitClass = () => {
    switch (fitMode) {
      case 'fit_width': return 'w-full h-auto';
      case 'fit_height': return 'h-screen w-auto max-w-full';
      case 'fit_screen': return 'max-w-full max-h-screen object-contain';
      case 'original': return '';
      default: return 'w-full h-auto';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <Loader size="lg" label="Carregando capítulo..." />
      </div>
    );
  }

  if (error || pages.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 gap-4">
        <p className="text-red-400">{error || 'Nenhuma página encontrada'}</p>
        <button onClick={() => navigate(-1)} className="text-purple-400 underline">Voltar</button>
      </div>
    );
  }

  const isWebtoon = readerMode === 'vertical_webtoon';
  const isRTL = readerMode === 'paged_rtl';
  const currentPageObj = pages[currentPage - 1];

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col select-none">
      {/* Header menu (togglable) */}
      {showMenu && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/95 to-transparent pb-8 px-4 pt-3">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate(-1)}
              className="text-gray-300 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {chapter?.title || `Capítulo ${chapter?.chapterNumber}`}
              </p>
              <p className="text-xs text-gray-400">
                {isWebtoon ? `Pág. ${currentPage}/${totalPages}` : `${currentPage} / ${totalPages}`}
                {isOffline && ' • 📴 Offline'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={toggleFullscreen} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
                {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
              <button onClick={() => setShowMenu(false)} className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Reader controls */}
          <div className="flex flex-wrap gap-2">
            {/* Mode selector */}
            {(['paged_rtl', 'paged_ltr', 'vertical_webtoon'] as ReaderMode[]).map(mode => {
              const labels = { paged_rtl: '← RTL', paged_ltr: 'LTR →', vertical_webtoon: '↓ Webtoon' };
              return (
                <button
                  key={mode}
                  onClick={() => setReaderMode(mode)}
                  className={cn('text-xs px-3 py-1.5 rounded-lg border transition-colors', readerMode === mode ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/20 text-gray-400 hover:text-white')}
                >
                  {labels[mode]}
                </button>
              );
            })}

            {/* Fit mode (paged only) */}
            {!isWebtoon && (['fit_width', 'fit_height', 'fit_screen', 'original'] as FitMode[]).map(mode => {
              const labels = { fit_width: 'Largura', fit_height: 'Altura', fit_screen: 'Tela', original: 'Original' };
              return (
                <button
                  key={mode}
                  onClick={() => setFitMode(mode)}
                  className={cn('text-xs px-3 py-1.5 rounded-lg border transition-colors', fitMode === mode ? 'bg-blue-700 border-blue-500 text-white' : 'border-white/20 text-gray-400 hover:text-white')}
                >
                  {labels[mode]}
                </button>
              );
            })}

            {/* Zoom (paged only) */}
            {!isWebtoon && (
              <div className="flex items-center gap-1">
                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                  <ZoomOut size={15} />
                </button>
                <span className="text-xs text-gray-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                  <ZoomIn size={15} />
                </button>
                <button onClick={() => setZoom(1)} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                  <RotateCcw size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chapter navigation prev/next */}
      {!isWebtoon && (
        <>
          <div
            className={cn('absolute top-0 bottom-0 w-1/3 z-[5] flex items-center cursor-pointer', isRTL ? 'right-0' : 'left-0')}
            onClick={nextPage}
          />
          <div
            className={cn('absolute top-0 bottom-0 w-1/3 z-[5] flex items-center cursor-pointer', isRTL ? 'left-0' : 'right-0')}
            onClick={prevPage}
          />
        </>
      )}

      {/* Center click to toggle menu */}
      <div
        className="absolute top-0 bottom-0 left-1/3 right-1/3 z-[6] cursor-pointer"
        onClick={() => setShowMenu(m => !m)}
      />

      {/* CONTENT */}
      {isWebtoon ? (
        // Vertical webtoon mode - continuous scroll
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          <div className="flex flex-col items-center">
            {pages.map((page, idx) => {
              const pUrl = page.url || page.imageUrl || '';
              const pIdx = page.index || page.pageNumber || idx + 1;
              return (
                <img
                  key={pIdx}
                  ref={el => { pageRefs.current[idx] = el; }}
                  src={resolveApiUrl(pUrl)}
                  alt={`Página ${pIdx}`}
                  className="w-full max-w-3xl mx-auto block"
                  style={{ marginBottom: pageSpacing + 'px' }}
                  loading={idx < 3 ? 'eager' : 'lazy'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={e => { (e.target as HTMLImageElement).src = `https://placehold.co/800x1200/111827/4b5563?text=Página+${pIdx}`; }}
                />
              );
            })}

            {/* Next chapter prompt at end */}
            <div className="w-full max-w-3xl mx-auto p-8 flex flex-col items-center gap-4 text-center">
              <p className="text-gray-400 text-sm">Fim do capítulo</p>
              <div className="flex gap-3">
                {prevChapter && (
                  <button
                    onClick={goPrevChapter}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1e29] border border-[#2a3040] rounded-lg text-sm text-gray-300 hover:text-white hover:border-purple-500/40 transition-colors"
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                )}
                {nextChapter && (
                  <button
                    onClick={goNextChapter}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-700 rounded-lg text-sm text-white hover:bg-purple-600 transition-colors"
                  >
                    Próximo <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Paged mode
        <div className="flex-1 overflow-hidden flex items-center justify-center bg-black">
          {currentPageObj && (
            <img
              src={resolveApiUrl(currentPageObj.url || currentPageObj.imageUrl || '')}
              alt={`Página ${currentPage}`}
              className={getFitClass()}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              onError={e => { (e.target as HTMLImageElement).src = `https://placehold.co/800x1200/111827/4b5563?text=Página+${currentPage}`; }}
            />
          )}
        </div>
      )}

      {/* Bottom bar (always visible) */}
      <div className={cn('flex items-center justify-between gap-3 px-4 py-2 bg-black/60 backdrop-blur-sm border-t border-white/5', showMenu && 'hidden')}>
        <button
          onClick={() => setShowMenu(true)}
          className="text-gray-500 hover:text-white transition-colors"
        >
          <Menu size={18} />
        </button>

        {!isWebtoon && (
          <div className="flex items-center gap-3 flex-1 justify-center">
            <button
              onClick={prevPage}
              className="text-gray-400 hover:text-white p-1.5 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

            {/* Page indicator / scrubber */}
            <div className="flex-1 max-w-xs flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={e => setCurrentPage(parseInt(e.target.value))}
                className="flex-1 accent-purple-500"
              />
              <span className="text-xs text-gray-400 w-16 text-right">{currentPage}/{totalPages}</span>
            </div>

            <button
              onClick={nextPage}
              className="text-gray-400 hover:text-white p-1.5 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {isWebtoon && (
          <div className="flex-1 text-center">
            <span className="text-xs text-gray-500">Pág. {currentPage}/{totalPages}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={goPrevChapter}
            disabled={!prevChapter}
            className="text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
            title="Capítulo anterior"
          >
            <BookOpen size={16} />
          </button>
          <button
            onClick={goNextChapter}
            disabled={!nextChapter}
            className="text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
            title="Próximo capítulo"
          >
            <List size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
