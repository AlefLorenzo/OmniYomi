import React from 'react';
import { cn } from '../../lib/utils';
import { resolveApiUrl } from '../../lib/api';

interface CoverCardProps {
  title: string;
  coverUrl: string;
  badges?: React.ReactNode;
  overlay?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function CoverCard({ title, coverUrl, badges, overlay, onClick, className }: CoverCardProps) {
  // CDNs públicas ou quando não há servidor configurado → carrega imagem diretamente sem proxy
  const base = resolveApiUrl('');
  const isDirectCdn =
    !base ||
    (coverUrl &&
      (coverUrl.includes('mangadex.org') ||
       coverUrl.includes('githubusercontent.com') ||
       coverUrl.includes('jsdelivr.net') ||
       coverUrl.includes('placehold.co') ||
       coverUrl.startsWith('data:') ||
       coverUrl.startsWith('blob:')));

  const proxiedUrl = !coverUrl
    ? ''
    : isDirectCdn
      ? coverUrl
      : coverUrl.startsWith('http') && !coverUrl.startsWith('/api/proxy')
        ? resolveApiUrl(`/api/proxy/image?url=${encodeURIComponent(coverUrl)}`)
        : resolveApiUrl(coverUrl);

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-lg overflow-hidden bg-[#1a1e29] shadow-lg',
        'hover:scale-[1.02] hover:shadow-purple-900/40 hover:shadow-xl transition-all duration-200',
        className
      )}
      onClick={onClick}
    >
      <div className="relative aspect-[2/3] w-full bg-[#121620] flex items-center justify-center">
        {proxiedUrl ? (
          <img
            src={proxiedUrl}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={e => {
              (e.target as HTMLElement).style.display = 'none';
              const fallback = (e.target as HTMLElement).nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}

        {/* Fallback quando imagem falhar ou estiver ausente */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-[#131722] border border-[#242c3d]"
          style={{ display: proxiedUrl ? 'none' : 'flex' }}
        >
          <span className="text-2xl mb-1">📖</span>
          <span className="text-[11px] font-medium text-gray-400 line-clamp-2">{title}</span>
          <span className="text-[9px] text-gray-600 mt-1 uppercase">Capa Pendente</span>
        </div>
        {/* Gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Badges top-right */}
        {badges && (
          <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
            {badges}
          </div>
        )}

        {/* Custom overlay (bottom) */}
        {overlay && (
          <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {overlay}
          </div>
        )}
      </div>

      <div className="p-2">
        <p className="text-xs text-gray-200 font-medium leading-tight line-clamp-2 group-hover:text-purple-300 transition-colors">
          {title}
        </p>
      </div>
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'green' | 'blue' | 'red' | 'yellow' | 'purple';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const colors: Record<string, string> = {
    default: 'bg-gray-800/90 text-gray-200',
    green: 'bg-green-900/90 text-green-300',
    blue: 'bg-blue-900/90 text-blue-300',
    red: 'bg-red-900/90 text-red-300',
    yellow: 'bg-yellow-900/90 text-yellow-300',
    purple: 'bg-purple-900/90 text-purple-300',
  };

  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold leading-tight', colors[variant], className)}>
      {children}
    </span>
  );
}
