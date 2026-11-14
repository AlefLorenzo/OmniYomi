import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex">
      <Sidebar />
      <main className="flex-1 ml-16 xl:ml-56 min-h-screen">
        <div className="max-w-[1600px] mx-auto p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
