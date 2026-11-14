export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem('omniyomi_server_url');
  if (stored) return stored.replace(/\/$/, '');

  // Detect Capacitor or Android WebView
  const isCapacitor =
    window.location.protocol === 'capacitor:' ||
    (window.location.protocol === 'http:' && window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '5173') ||
    (window.location.protocol === 'https:' && window.location.hostname === 'localhost') ||
    Boolean((window as any).Capacitor?.isNativePlatform?.());

  if (isCapacitor) {
    // Porta 8888 funciona como proxy unificado HTTP e WebSocket para :4567
    return 'http://192.168.0.111:8888';
  }

  return '';
}

export function setApiBaseUrl(url: string) {
  if (!url) {
    localStorage.removeItem('omniyomi_server_url');
  } else {
    localStorage.setItem('omniyomi_server_url', url.trim().replace(/\/$/, ''));
  }
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('blob:') || pathOrUrl.startsWith('data:')) {
    return pathOrUrl;
  }
  const base = getApiBaseUrl();
  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${cleanPath}`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${base}/api${cleanPath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(fullUrl, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: options.signal || controller.signal,
      ...options,
    });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Servidor indisponível.`);
      }
      throw new Error(`Resposta não-JSON recebida. Verifique o servidor OmniYomi.`);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Tempo limite esgotado ao conectar ao servidor (${base || 'localhost'}).`);
    }
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      throw new Error(`Não foi possível conectar ao servidor OmniYomi (${base || 'localhost'}). Verifique se o PC e o celular estão na mesma rede Wi-Fi.`);
    }
    throw err;
  }
}

export const api = {
  health: () => request<{ status: string; version: string; app: string }>('/health'),

  // Sources
  getSources: async () => {
    try {
      return await request<any[]>('/sources');
    } catch {
      return [
        {
          id: 'mangadex',
          name: 'MangaDex',
          version: '1.0.0',
          lang: 'all',
          iconUrl: 'https://mangadex.org/favicon.ico',
          baseUrl: 'https://api.mangadex.org',
          isEnabled: true,
          isNsfw: false,
          hasPopular: true,
          hasLatest: true,
          supportsSearch: true,
        },
      ];
    }
  },
  getPopular: (sourceId: string, page = 1) => request<any>(`/sources/${sourceId}/popular?page=${page}`),
  getLatest: (sourceId: string, page = 1) => request<any>(`/sources/${sourceId}/latest?page=${page}`),
  searchSource: (sourceId: string, q: string, page = 1) => request<any>(`/sources/${sourceId}/search?q=${encodeURIComponent(q)}&page=${page}`),
  checkSourceHealth: (id: string) => request<any>(`/sources/${id}/health`),
  toggleSource: (id: string, enabled: boolean) => request<any>(`/sources/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  globalSearch: (q: string) => request<any>(`/sources/search/global?q=${encodeURIComponent(q)}`),
  deduplicatedSearch: (q: string) => request<any>(`/sources/search/deduplicated?q=${encodeURIComponent(q)}`),
  getFlareSolverrStatus: () => request<{ available: boolean; message: string; version?: string }>('/sources/flaresolverr/status'),

  // Extensions & Repos
  getAvailableExtensions: () => request<any[]>('/extensions/available'),
  uninstallExtension: (id: string) => request<any>(`/extensions/${id}`, { method: 'DELETE' }),
  getRepos: () => request<any[]>('/extensions/repos'),
  addRepo: (url: string, name?: string) => request<any>('/extensions/repos', { method: 'POST', body: JSON.stringify({ url, name }) }),
  deleteRepo: (url: string) => request<any>('/extensions/repos', { method: 'DELETE', body: JSON.stringify({ url }) }),
  toggleRepo: (url: string, enabled: boolean) => request<any>('/extensions/repos/toggle', { method: 'POST', body: JSON.stringify({ url, enabled }) }),
  getStoreExtensions: async (q?: string, lang?: string) => {
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (lang && lang !== 'all') params.append('lang', lang);
    const qs = params.toString();
    try {
      return await request<{ total: number; extensions: any[] }>(`/extensions/store${qs ? `?${qs}` : ''}`);
    } catch (err) {
      // Fallback direto via GitHub para carregar a loja mesmo sem o PC
      try {
        const ghRes = await fetch('https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json');
        if (ghRes.ok) {
          const list = await ghRes.json();
          let filtered = Array.isArray(list) ? list : [];
          if (lang && lang !== 'all') {
            filtered = filtered.filter((e: any) => e.lang === lang || e.lang === 'all');
          }
          if (q && q.trim()) {
            const query = q.toLowerCase();
            filtered = filtered.filter((e: any) =>
              e.name?.toLowerCase().includes(query) || e.pkg?.toLowerCase().includes(query)
            );
          }
          const mapped = filtered.map((e: any) => ({
            name: e.name,
            pkg: e.pkg,
            version: e.version,
            lang: e.lang,
            isNsfw: Boolean(e.isNsfw || e.nsfw),
            iconUrl: `https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/${e.pkg}.png`,
            apkUrl: `https://raw.githubusercontent.com/keiyoushi/extensions/repo/apk/${e.apk}`,
            isInstalled: false,
            repoName: 'Keiyoushi (GitHub)',
            sources: (e.sources || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              baseUrl: s.baseUrl,
              lang: s.lang,
            })),
          }));
          return { total: mapped.length, extensions: mapped };
        }
      } catch {}
      throw err;
    }
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
  toggleFavorite: (id: string, isFavorite: boolean) =>
    request<any>(`/manga/${id}/favorite`, { method: 'POST', body: JSON.stringify({ isFavorite }) }),
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
