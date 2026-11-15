import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { ServerBanner } from './ServerBanner';

export function Layout() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      <ServerBanner />
      <div className="flex-1 flex">
        {/* Sidebar - only desktop */}
        <Sidebar />
        {/* Main content */}
        <main className="flex-1 min-w-0 w-full md:ml-16 xl:ml-56 min-h-screen pb-20 md:pb-6 overflow-x-hidden">
          <div className="w-full max-w-[1600px] mx-auto px-3 py-4 sm:px-4 md:px-6">
            <Outlet />
          </div>
        </main>
        {/* Bottom nav - only mobile */}
        <BottomNav />
      </div>
    </div>
  );
}
