import { NavLink, useLocation } from 'react-router-dom';
import { Home, Library, Globe, BookMarked, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

const items = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/library', icon: Library, label: 'Biblioteca' },
  { to: '/catalog', icon: Globe, label: 'Catálogo' },
  { to: '/sources', icon: BookMarked, label: 'Fontes' },
  { to: '/settings', icon: Settings, label: 'Config.' },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#0d1017]/95 backdrop-blur-md border-t border-[#1f2535]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5 w-full max-w-lg mx-auto h-14">
        {items.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center justify-center py-1 transition-all select-none',
                isActive ? 'text-purple-400 font-medium' : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <Icon size={20} className={cn('transition-transform duration-150', isActive && 'scale-110 text-purple-400')} />
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[60px] text-center">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
