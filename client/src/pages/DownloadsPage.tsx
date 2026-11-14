import { useEffect, useState, useCallback } from 'react';
import { Pause, Play, Trash2, X, HardDrive, RefreshCw, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Loader, ProgressBar, Empty } from '../components/ui/index';
import { useWs } from '../lib/ws';
import { useToast } from '../components/ui/ToastProvider';
import { downloadStatusLabel, cn } from '../lib/utils';

export function DownloadsPage() {
  const [downloads, setDownloads] = useState<any[]>([]);
  const [storageUsage, setStorageUsage] = useState<any>({ formatted: '—' });
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const { subscribe } = useWs();
  const { show } = useToast();

  const loadDownloads = useCallback(async () => {
    try {
      const [dls, storage] = await Promise.all([api.getDownloads(), api.getStorageUsage()]);
      setDownloads(dls);
      setStorageUsage(storage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDownloads();

    // Real-time updates via WebSocket
    const unsubs = [
      subscribe('DOWNLOAD_PROGRESS', () => loadDownloads()),
      subscribe('DOWNLOAD_COMPLETED', () => { loadDownloads(); show('Download concluído!', 'success'); }),
      subscribe('DOWNLOAD_ERROR', (msg) => { loadDownloads(); show(msg.data?.error || 'Erro no download', 'error'); }),
      subscribe('DOWNLOAD_QUEUE_UPDATED', () => loadDownloads()),
    ];

    return () => unsubs.forEach(u => u());
  }, []);

  const handlePauseResume = async () => {
    if (paused) {
      await api.resumeDownloads();
      setPaused(false);
    } else {
      await api.pauseDownloads();
      setPaused(true);
    }
  };

  const handleCancel = async (chapterId: string, deleteFiles = false) => {
    try {
      await api.cancelDownload(chapterId, deleteFiles);
      await loadDownloads();
      show('Download cancelado', 'info');
    } catch (e: any) {
      show(e.message, 'error');
    }
  };

  const handleClearCompleted = async () => {
    await api.clearCompleted();
    await loadDownloads();
    show('Downloads concluídos removidos', 'info');
  };

  const handleScanLocal = async () => {
    try {
      const res = await api.scanLocal();
      show(`${res.importedCount} capítulos importados da pasta local`, 'success');
      await loadDownloads();
    } catch (e: any) {
      show(e.message, 'error');
    }
  };

  const active = downloads.filter(d => ['PENDING', 'DOWNLOADING', 'PAUSED'].includes(d.status));
  const completed = downloads.filter(d => d.status === 'COMPLETED');
  const failed = downloads.filter(d => d.status === 'FAILED');

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Downloads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active.length} ativos • {completed.length} concluídos • <HardDrive size={12} className="inline" /> {storageUsage.formatted}
          </p>
        </div>
        <div className="flex gap-2">
          {active.length > 0 && (
            <Button variant="secondary" size="sm" onClick={handlePauseResume}>
              {paused ? <><Play size={14} /> Retomar</> : <><Pause size={14} /> Pausar</>}
            </Button>
          )}
          {completed.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearCompleted}>
              <Trash2 size={14} /> Limpar concluídos
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleScanLocal} title="Importar downloads existentes na pasta local">
            <FolderOpen size={14} /> Escanear local
          </Button>
          <Button variant="ghost" size="sm" onClick={loadDownloads}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {downloads.length === 0 ? (
        <Empty
          icon="⬇️"
          title="Nenhum download"
          description="Os downloads aparecerão aqui quando você baixar capítulos de uma obra"
        />
      ) : (
        <div className="space-y-4">
          {/* Active downloads */}
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-2">Ativos ({active.length})</h2>
              <div className="space-y-2">
                {active.map(d => (
                  <DownloadItem key={d.id} item={d} onCancel={() => handleCancel(d.chapterId)} />
                ))}
              </div>
            </section>
          )}

          {/* Failed */}
          {failed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-red-400 mb-2">Falhas ({failed.length})</h2>
              <div className="space-y-2">
                {failed.map(d => (
                  <DownloadItem key={d.id} item={d} onCancel={() => handleCancel(d.chapterId)} />
                ))}
              </div>
            </section>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-green-400 mb-2">Concluídos ({completed.length})</h2>
              <div className="space-y-2">
                {completed.map(d => (
                  <DownloadItem key={d.id} item={d} onCancel={() => handleCancel(d.chapterId, true)} isCancelDelete />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function DownloadItem({ item, onCancel, isCancelDelete }: { item: any; onCancel: () => void; isCancelDelete?: boolean }) {
  const statusColors: Record<string, string> = {
    PENDING: 'text-yellow-400',
    DOWNLOADING: 'text-blue-400',
    PAUSED: 'text-orange-400',
    COMPLETED: 'text-green-400',
    FAILED: 'text-red-400',
    CANCELLED: 'text-gray-500',
  };

  const progressColors: Record<string, 'purple' | 'green' | 'red' | 'blue'> = {
    DOWNLOADING: 'blue',
    COMPLETED: 'green',
    FAILED: 'red',
    PAUSED: 'purple',
    PENDING: 'purple',
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-[#1a1e29] border border-[#2a3040] rounded-xl">
      <img
        src={item.coverUrl}
        alt={item.mangaTitle}
        className="w-10 h-14 object-cover rounded flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/80x112/1a1e29/8b5cf6?text=?'; }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate">{item.mangaTitle}</p>
        <p className="text-xs text-gray-400 truncate">{item.chapterTitle}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <ProgressBar value={item.progress} variant={progressColors[item.status] || 'purple'} className="flex-1" />
          <span className="text-xs text-gray-500 w-10 text-right">{item.progress}%</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn('text-[11px] font-medium', statusColors[item.status])}>{downloadStatusLabel[item.status] || item.status}</span>
          {item.downloadedPages > 0 && (
            <span className="text-[11px] text-gray-600">{item.downloadedPages}/{item.totalPages} págs.</span>
          )}
          {item.error && <span className="text-[11px] text-red-400 truncate">{item.error}</span>}
        </div>
      </div>
      <button
        onClick={onCancel}
        className="flex-shrink-0 text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-900/20"
        title={isCancelDelete ? 'Remover e apagar arquivos' : 'Cancelar'}
      >
        {isCancelDelete ? <Trash2 size={15} /> : <X size={15} />}
      </button>
    </div>
  );
}
