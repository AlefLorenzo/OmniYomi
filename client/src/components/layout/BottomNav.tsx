import { NavLink, useLocation } from 'react-router-dom';
import { Home, Library, Globe, Download, Settings, BookMarked } from 'lucide-react';
import { cn } from '../../lib/utils';

const items = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/library', icon: Library, label: 'Biblioteca' },
  { to: '/catalog', icon: Globe, label: 'Catálogo' },
  { to: '/sources', icon: BookMarked, label: 'Fontes' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/settings', icon: Settings, label: 'Config.' },
];

export function BottomNav() {
  const location = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#0d1017]/95 backdrop-blur-md border-t border-[#1f2535]"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around">
        {items.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink key={to} to={to} className={cn(
              'flex-1 flex flex-col items-center justify-center py-1.5 gap-0.5 min-h-[52px] transition-all',
              isActive ? 'text-purple-400 font-semibold' : 'text-gray-500 hover:text-gray-300'
            )}>
              <Icon size={19} className={cn(isActive && 'scale-110 transition-transform')} />
              <span className="text-[10px] leading-tight truncate px-0.5">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
