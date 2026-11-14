import { NavLink, useLocation } from 'react-router-dom';
import { Home, Library, Globe, Download, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';

const items = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/library', icon: Library, label: 'Biblioteca' },
  { to: '/catalog', icon: Globe, label: 'Catálogo' },
  { to: '/downloads', icon: Download, label: 'Downloads' },
  { to: '/settings', icon: Settings, label: 'Config.' },
];

export function BottomNav() {
  const location = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-[#0d1017] border-t border-[#1f2535]"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex">
        {items.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink key={to} to={to} className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors',
              isActive ? 'text-purple-400' : 'text-gray-500'
            )}>
              <Icon size={20} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
