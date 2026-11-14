const BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  health: () => request<{ status: string; version: string; app: string }>('/health'),

  // Sources
  getSources: () => request<any[]>('/sources'),
  getPopular: (sourceId: string, page = 1) => request<any>(`/sources/${sourceId}/popular?page=${page}`),
  getLatest: (sourceId: string, page = 1) => request<any>(`/sources/${sourceId}/latest?page=${page}`),
  searchSource: (sourceId: string, q: string, page = 1) => request<any>(`/sources/${sourceId}/search?q=${encodeURIComponent(q)}&page=${page}`),
  checkSourceHealth: (id: string) => request<any>(`/sources/${id}/health`),
  toggleSource: (id: string, enabled: boolean) => request<any>(`/sources/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  globalSearch: (q: string) => request<any>(`/sources/search/global?q=${encodeURIComponent(q)}`),

  // Extensions & Repos
  getAvailableExtensions: () => request<any[]>('/extensions/available'),
  uninstallExtension: (id: string) => request<any>(`/extensions/${id}`, { method: 'DELETE' }),
  getRepos: () => request<any[]>('/extensions/repos'),
  addRepo: (url: string, name?: string) => request<any>('/extensions/repos', { method: 'POST', body: JSON.stringify({ url, name }) }),
  deleteRepo: (url: string) => request<any>('/extensions/repos', { method: 'DELETE', body: JSON.stringify({ url }) }),
  toggleRepo: (url: string, enabled: boolean) => request<any>('/extensions/repos/toggle', { method: 'POST', body: JSON.stringify({ url, enabled }) }),
  getStoreExtensions: (q?: string, lang?: string) => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (lang && lang !== 'all') params.append('lang', lang);
    const qs = params.toString();
    return request<{ total: number; extensions: any[] }>(`/extensions/store${qs ? `?${qs}` : ''}`);
  },
  extractExtension: (pkg: string, apkUrl: string, repoUrl?: string) =>
    request<any>('/extensions/extract', { method: 'POST', body: JSON.stringify({ pkg, apkUrl, repoUrl }) }),
  uninstallExtracted: (pkg: string) => request<any>(`/extensions/extracted/${pkg}`, { method: 'DELETE' }),

  // Manga
  getManga: (id: string) => request<any>(`/manga/${id}`),
  getChapters: (mangaId: string) => request<any[]>(`/manga/${mangaId}/chapters`),
  refreshManga: (mangaId: string) => request<any>(`/manga/${mangaId}/refresh`, { method: 'POST' }),
  setInLibrary: (id: string, inLibrary: boolean, categoryId?: string) =>
    request<any>(`/manga/${id}/library`, { method: 'POST', body: JSON.stringify({ inLibrary, categoryId }) }),
  setCategory: (id: string, categoryId: string) =>
    request<any>(`/manga/${id}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) }),

  // Chapters
  getPages: (chapterId: string) => request<any>(`/chapters/${chapterId}/pages`),
  updateProgress: (chapterId: string, page: number, totalPages: number, isRead: boolean) =>
    request<any>(`/chapters/${chapterId}/progress`, { method: 'POST', body: JSON.stringify({ page, totalPages, isRead }) }),
  markChaptersRead: (chapterIds: string[], isRead: boolean) =>
    request<any>('/chapters/mark-read', { method: 'POST', body: JSON.stringify({ chapterIds, isRead }) }),

  // Downloads
  getDownloads: () => request<any[]>('/downloads'),
  getStorageUsage: () => request<{ totalBytes: number; formatted: string }>('/downloads/storage'),
  enqueueDownload: (chapterId: string) => request<any>('/downloads/enqueue', { method: 'POST', body: JSON.stringify({ chapterId }) }),
  enqueueBatch: (chapterIds: string[]) => request<any>('/downloads/enqueue-batch', { method: 'POST', body: JSON.stringify({ chapterIds }) }),
  cancelDownload: (chapterId: string, deleteFiles = false) => request<any>(`/downloads/${chapterId}?deleteFiles=${deleteFiles}`, { method: 'DELETE' }),
  pauseDownloads: () => request<any>('/downloads/pause', { method: 'POST' }),
  resumeDownloads: () => request<any>('/downloads/resume', { method: 'POST' }),
  clearCompleted: () => request<any>('/downloads/clear-completed', { method: 'POST' }),
  scanLocal: () => request<any>('/downloads/scan-local', { method: 'POST' }),

  // Library
  getLibrary: (category?: string, search?: string) => {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (search) params.append('search', search);
    const qs = params.toString();
    return request<any[]>(`/library${qs ? `?${qs}` : ''}`);
  },
  getCategories: () => request<any[]>('/library/categories'),
  createCategory: (name: string) => request<any>('/library/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCategory: (id: string) => request<any>(`/library/categories/${id}`, { method: 'DELETE' }),

  // History
  getHistory: (limit = 50) => request<any[]>(`/history?limit=${limit}`),
  clearHistory: () => request<any>('/history', { method: 'DELETE' }),

  // Settings
  getSettings: () => request<any>('/settings'),
  updateSettings: (settings: any) => request<any>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // Updates
  checkUpdates: () => request<any>('/updates/check', { method: 'POST' }),
};
