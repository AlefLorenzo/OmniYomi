import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, BookOpen, Globe, Library, Download, History, Heart, Settings, Wifi, WifiOff,
  BookMarked
} from 'lucide-react';
import { useWs } from '../../lib/ws';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/library', icon: Library, label: 'Biblioteca' },
  { to: '/catalog', icon: Globe, label: 'Catálogo' },
  { to: '/sources', icon: BookMarked, label: 'Fontes' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/history', icon: History, label: 'Histórico' },
  { to: '/favorites', icon: Heart, label: 'Favoritos' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

export function Sidebar() {
  const { connected } = useWs();
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-30 w-16 xl:w-56 bg-[#0d1017] border-r border-[#1f2535] hidden md:flex flex-col">
      {/* Logo */}
      <div className="px-3 py-4 border-b border-[#1f2535] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-900/40">
          <BookOpen size={18} className="text-white" />
        </div>
        <span className="hidden xl:block font-bold text-white text-lg tracking-tight">OmniYomi</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(to);

          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 mx-2 my-0.5 rounded-lg transition-all duration-150',
                isActive
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-[#1a1e29]'
              )}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="hidden xl:block text-sm font-medium">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Connection status */}
      <div className="px-3 py-3 border-t border-[#1f2535]">
        <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg', connected ? 'text-green-400' : 'text-red-400')}>
          {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
          <span className="hidden xl:block text-xs font-medium">{connected ? 'Conectado' : 'Desconectado'}</span>
        </div>
      </div>
    </aside>
  );
}
