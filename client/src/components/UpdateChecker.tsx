import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { checkForUpdate, type ReleaseInfo } from '../lib/updater';

export function UpdateChecker() {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const info = await checkForUpdate();
      if (info) setRelease(info);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!release || dismissed) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm
                    bg-[#1a2035] border border-purple-500/40 rounded-xl shadow-2xl p-4
                    flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">
            Nova versão disponível: v{release.version}
          </p>
          {release.releaseNotes && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{release.releaseNotes}</p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-500 hover:text-white transition-colors shrink-0 p-0.5"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex gap-2">
        <a
          href={release.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg
                     bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
        >
          <Download size={15} />
          Baixar APK
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="py-2 px-4 rounded-lg bg-[#2a3045] hover:bg-[#323a55] text-gray-300
                     text-sm font-medium transition-colors"
        >
          Depois
        </button>
      </div>
    </div>
  );
}
