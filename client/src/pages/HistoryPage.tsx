import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { CoverCard } from '../components/ui/CoverCard';
import { Button, Loader, Empty } from '../components/ui/index';
import { formatRelativeDate } from '../lib/utils';
import { Trash2 } from 'lucide-react';
import { useToast } from '../components/ui/ToastProvider';

export function HistoryPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const h = await api.getHistory(100);
      setHistory(h);
    } finally {
      setLoading(false);
    }
  }

  function resumeHistoryItem(item: any) {
    const chapterId = String(item.chapterId || '');
    if (!chapterId) return;
    const inferredSourceId = chapterId.startsWith('apk:') ? chapterId.split(':').slice(0, 3).join(':') : 'mangadex';
    const sourceId = item.sourceId || inferredSourceId;
    const mangaId = item.mangaId || (sourceId.startsWith('apk:') ? chapterId.slice(0, chapterId.lastIndexOf(':')) : '');
    const params = new URLSearchParams({ sourceId });
    if (mangaId) params.set('mangaId', mangaId);
    navigate(`/read/${encodeURIComponent(chapterId)}?${params.toString()}`);
  }

  async function handleClearHistory() {
    if (!confirm('Limpar todo o histórico de leitura?')) return;
    await api.clearHistory();
    setHistory([]);
    show('Histórico apagado', 'info');
  }

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Histórico</h1>
          <p className="text-sm text-gray-500 mt-0.5">{history.length} registros</p>
        </div>
        {history.length > 0 && (
          <Button variant="danger" size="sm" onClick={handleClearHistory}>
            <Trash2 size={14} /> Limpar tudo
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <Empty icon="📖" title="Nenhuma leitura registrada" description="Comece a ler para ver seu histórico aqui" />
      ) : (
        <div className="space-y-1 border border-[#1f2535] rounded-xl overflow-hidden">
          {history.map(item => (
            <div
              key={item.chapterId || item.id || item.readAt}
              className="flex items-center gap-3 p-3 hover:bg-[#1a1e29] cursor-pointer transition-colors"
              onClick={() => resumeHistoryItem(item)}
            >
              <img
                src={item.coverUrl}
                alt={item.mangaTitle}
                className="w-10 h-14 object-cover rounded flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/80x112/1a1e29/8b5cf6?text=?'; }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{item.mangaTitle}</p>
                <p className="text-xs text-gray-400 truncate">{item.chapterTitle}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Pág. {item.page}/{item.totalPages || '?'} • {formatRelativeDate(item.readAt)}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-xs text-gray-600">{Math.round((item.page / (item.totalPages || 1)) * 100)}%</div>
                <div className="w-12 h-1 bg-gray-800 rounded-full mt-1">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.round((item.page / (item.totalPages || 1)) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
