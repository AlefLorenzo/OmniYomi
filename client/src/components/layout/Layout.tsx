import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

export function Layout() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      {/* Sidebar - only desktop */}
      <Sidebar />
      {/* Main content */}
      <main className="flex-1 md:ml-16 xl:ml-56 min-h-screen pb-16 md:pb-0">
        <div className="max-w-[1600px] mx-auto p-3 sm:p-4 md:p-6">
          <Outlet />
        </div>
      </main>
      {/* Bottom nav - only mobile */}
      <BottomNav />
    </div>
  );
}
