import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WsProvider } from './lib/ws';
import { ToastProvider } from './components/ui/ToastProvider';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { LibraryPage } from './pages/LibraryPage';
import { SourcesPage } from './pages/SourcesPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { HistoryPage } from './pages/HistoryPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { SettingsPage } from './pages/SettingsPage';
import { MangaDetailPage } from './pages/MangaDetailPage';
import { ReaderPage } from './pages/ReaderPage';

export default function App() {
  return (
    <BrowserRouter>
      <WsProvider>
        <ToastProvider>
          <Routes>
            {/* Reader is full-screen, no sidebar */}
            <Route path="/read/:chapterId" element={<ReaderPage />} />

            {/* Main layout with sidebar */}
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/manga/:id" element={<MangaDetailPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </WsProvider>
    </BrowserRouter>
  );
}
