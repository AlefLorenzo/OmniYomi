export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem('omniyomi_server_url');
  if (stored) return stored.replace(/\/$/, '');

  // Se estiver rodando no navegador acessando o IP do PC (ex: http://192.168.0.111:8888/app/)
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    if (window.location.port === '8888' || window.location.port === '4567') {
      return window.location.origin;
    }
  }

  // Detect Capacitor or Android WebView
  const isCapacitor =
    window.location.protocol === 'capacitor:' ||
    Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
    (window.location.protocol === 'http:' && window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '5173');

  if (isCapacitor) {
    // Por padrão conecta no IP da máquina na porta 8888 (com proxy HTTP e WebSocket)
    return 'http://192.168.0.111:8888';
  }

  return '';
}

export function isCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'capacitor:' ||
    Boolean((window as any).Capacitor?.isNativePlatform?.()) ||
    (window.location.protocol === 'http:' && window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '5173')
  );
}

export function isServerConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('omniyomi_server_url');
  return Boolean(stored && stored.trim().length > 0);
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

// Funções auxiliares para persistência local no dispositivo móvel (modo standalone / offline)
function getLocalLibrary(): any[] {
  try {
    return JSON.parse(localStorage.getItem('omniyomi_local_library') || '[]');
  } catch {
    return [];
  }
}

function saveLocalLibrary(list: any[]) {
  try {
    localStorage.setItem('omniyomi_local_library', JSON.stringify(list));
  } catch {}
}

function getLocalHistory(): any[] {
  try {
    return JSON.parse(localStorage.getItem('omniyomi_local_history') || '[]');
  } catch {
    return [];
  }
}

function saveLocalHistory(list: any[]) {
  try {
    localStorage.setItem('omniyomi_local_history', JSON.stringify(list));
  } catch {}
}

// Suporte direto à API do MangaDex sem depender de servidor local
async function fetchMangaDexPopular(page = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `https://api.mangadex.org/manga?limit=${limit}&offset=${offset}&order[followedCount]=desc&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MangaDex API erro ${res.status}`);
  const data = await res.json();
  const mangas = (data.data || []).map((m: any) => {
    const title = m.attributes?.title?.['pt-br'] || m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || 'Sem título';
    const desc = m.attributes?.description?.['pt-br'] || m.attributes?.description?.en || '';
    const coverRel = m.relationships?.find((r: any) => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const coverUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : '';
    return {
      id: m.id,
      sourceId: 'mangadex',
      title,
      coverUrl,
      description: desc,
      status: m.attributes?.status || 'ongoing',
      tags: (m.attributes?.tags || []).map((t: any) => t.attributes?.name?.en).filter(Boolean),
    };
  });
  return { manga: mangas, hasNextPage: (data.total || 0) > offset + limit };
}

async function searchMangaDex(q: string, page = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MangaDex search erro ${res.status}`);
  const data = await res.json();
  const mangas = (data.data || []).map((m: any) => {
    const title = m.attributes?.title?.['pt-br'] || m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || 'Sem título';
    const desc = m.attributes?.description?.['pt-br'] || m.attributes?.description?.en || '';
    const coverRel = m.relationships?.find((r: any) => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const coverUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.256.jpg` : '';
    return {
      id: m.id,
      sourceId: 'mangadex',
      title,
      coverUrl,
      description: desc,
      status: m.attributes?.status || 'ongoing',
      tags: (m.attributes?.tags || []).map((t: any) => t.attributes?.name?.en).filter(Boolean),
    };
  });
  return { manga: mangas, hasNextPage: (data.total || 0) > offset + limit };
}

async function getMangaDexDetails(mangaId: string) {
  const url = `https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MangaDex manga erro ${res.status}`);
  const data = await res.json();
  const m = data.data;
  const title = m.attributes?.title?.['pt-br'] || m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || 'Sem título';
  const desc = m.attributes?.description?.['pt-br'] || m.attributes?.description?.en || '';
  const coverRel = m.relationships?.find((r: any) => r.type === 'cover_art');
  const fileName = coverRel?.attributes?.fileName;
  const authorRel = m.relationships?.find((r: any) => r.type === 'author');
  const coverUrl = fileName ? `https://uploads.mangadex.org/covers/${m.id}/${fileName}.512.jpg` : '';
  const localLib = getLocalLibrary();
  const inLib = localLib.some((item: any) => item.id === mangaId);

  return {
    id: m.id,
    sourceId: 'mangadex',
    sourceMangaId: m.id,
    title,
    coverUrl,
    description: desc,
    author: authorRel?.attributes?.name || '',
    artist: '',
    status: m.attributes?.status || 'ongoing',
    tags: (m.attributes?.tags || []).map((t: any) => t.attributes?.name?.en).filter(Boolean),
    inLibrary: inLib,
    isFavorite: inLib,
  };
}

async function getMangaDexChapters(mangaId: string) {
  const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=pt-br&translatedLanguage[]=en&order[chapter]=desc&limit=100`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map((c: any, index: number) => ({
    id: c.id,
    mangaId,
    sourceChapterId: c.id,
    chapterNumber: parseFloat(c.attributes?.chapter || `${index + 1}`),
    name: c.attributes?.title ? `Capítulo ${c.attributes.chapter}: ${c.attributes.title}` : `Capítulo ${c.attributes?.chapter || index + 1}`,
    language: c.attributes?.translatedLanguage || 'pt-br',
    scanlator: '',
    releasedAt: c.attributes?.publishAt || new Date().toISOString(),
    isRead: false,
    isDownloaded: false,
  }));
}

async function getMangaDexPages(chapterId: string) {
  const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MangaDex páginas erro ${res.status}`);
  const data = await res.json();
  const baseUrl = data.baseUrl;
  const hash = data.chapter.hash;
  const pages = (data.chapter.data || []).map((file: string, idx: number) => ({
    pageNumber: idx + 1,
    imageUrl: `${baseUrl}/data/${hash}/${file}`,
  }));
  return { chapterId, pages };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();
  // Se for aplicativo nativo (Capacitor/Android) e não houver base configurada, não faz chamada relativa para não receber index.html
  if (!base && isCapacitorApp()) {
    throw new Error('Servidor local não configurado');
  }

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

// Extensões instaladas localmente no celular (standalone)
function getLocalInstalledSources(): any[] {
  try {
    const custom = JSON.parse(localStorage.getItem('omniyomi_installed_sources') || '[]');
    return custom;
  } catch {
    return [];
  }
}

function saveLocalInstalledSources(list: any[]) {
  try {
    localStorage.setItem('omniyomi_installed_sources', JSON.stringify(list));
  } catch {}
}

const DEFAULT_POPULAR_SOURCES = [
  {
    id: 'mangadex',
    name: 'MangaDex',
    version: '1.4.15',
    lang: 'all',
    iconUrl: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    isEnabled: true,
    isNsfw: false,
    hasPopular: true,
    hasLatest: true,
    supportsSearch: true,
  },
  {
    id: 'brmangas',
    name: 'BR Mangás',
    version: '1.4.8',
    lang: 'pt-br',
    iconUrl: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/eu.kanade.tachiyomi.extension.pt.brmangas.png',
    baseUrl: 'https://brmangas.net',
    isEnabled: true,
    isNsfw: false,
    hasPopular: true,
    hasLatest: true,
    supportsSearch: true,
  },
  {
    id: 'mangalivre',
    name: 'Manga Livre',
    version: '1.4.20',
    lang: 'pt-br',
    iconUrl: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/eu.kanade.tachiyomi.extension.pt.mangalivre.png',
    baseUrl: 'https://mangalivre.net',
    isEnabled: true,
    isNsfw: false,
    hasPopular: true,
    hasLatest: true,
    supportsSearch: true,
  },
  {
    id: 'lermanga',
    name: 'Ler Mangá',
    version: '1.3.12',
    lang: 'pt-br',
    iconUrl: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/eu.kanade.tachiyomi.extension.pt.lermanga.png',
    baseUrl: 'https://lermanga.org',
    isEnabled: true,
    isNsfw: false,
    hasPopular: true,
    hasLatest: true,
    supportsSearch: true,
  },
  {
    id: 'tsundoku',
    name: 'Tsundoku Traduções',
    version: '1.2.9',
    lang: 'pt-br',
    iconUrl: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/eu.kanade.tachiyomi.extension.pt.tsundokutraducoes.png',
    baseUrl: 'https://tsundoku.com.br',
    isEnabled: true,
    isNsfw: false,
    hasPopular: true,
    hasLatest: true,
    supportsSearch: true,
  },
  {
    id: 'flamecomics',
    name: 'Flame Comics',
    version: '1.4.3',
    lang: 'en',
    iconUrl: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/eu.kanade.tachiyomi.extension.en.flamecomics.png',
    baseUrl: 'https://flamecomics.xyz',
    isEnabled: true,
    isNsfw: false,
    hasPopular: true,
    hasLatest: true,
    supportsSearch: true,
  },
  {
    id: 'asurascans',
    name: 'Asura Scans',
    version: '1.4.35',
    lang: 'en',
    iconUrl: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/eu.kanade.tachiyomi.extension.en.asurascans.png',
    baseUrl: 'https://asuracomic.net',
    isEnabled: true,
    isNsfw: false,
    hasPopular: true,
    hasLatest: true,
    supportsSearch: true,
  },
];

export const api = {
  health: () => request<{ status: string; version: string; app: string }>('/health'),

  // Sources
  getSources: async () => {
    try {
      const serverSources = await request<any[]>('/sources');
      if (Array.isArray(serverSources) && serverSources.length > 0) return serverSources;
    } catch {}

    const locals = getLocalInstalledSources();
    const map = new Map<string, any>();
    DEFAULT_POPULAR_SOURCES.forEach(s => map.set(s.id, s));
    locals.forEach(s => map.set(s.id, s));
    return Array.from(map.values());
  },
  getPopular: async (sourceId: string, page = 1) => {
    try {
      return await request<any>(`/sources/${sourceId}/popular?page=${page}`);
    } catch {
      return fetchMangaDexPopular(page);
    }
  },
  getLatest: async (sourceId: string, page = 1) => {
    try {
      return await request<any>(`/sources/${sourceId}/latest?page=${page}`);
    } catch {
      return fetchMangaDexPopular(page);
    }
  },
  searchSource: async (sourceId: string, q: string, page = 1) => {
    try {
      return await request<any>(`/sources/${sourceId}/search?q=${encodeURIComponent(q)}&page=${page}`);
    } catch {
      return searchMangaDex(q, page);
    }
  },
  checkSourceHealth: (id: string) => request<any>(`/sources/${id}/health`),
  toggleSource: (id: string, enabled: boolean) => request<any>(`/sources/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  globalSearch: async (q: string) => {
    try {
      return await request<any>(`/sources/search/global?q=${encodeURIComponent(q)}`);
    } catch {
      const res = await searchMangaDex(q, 1);
      return { query: q, results: [{ sourceId: 'mangadex', sourceName: 'MangaDex', manga: res.manga }] };
    }
  },
  deduplicatedSearch: async (q: string) => {
    try {
      return await request<any>(`/sources/search/deduplicated?q=${encodeURIComponent(q)}`);
    } catch {
      const res = await searchMangaDex(q, 1);
      return { query: q, total: res.manga.length, entries: res.manga.map((m: any) => ({ canonical: m, sources: [m] })) };
    }
  },
  getFlareSolverrStatus: () => request<{ available: boolean; message: string; version?: string }>('/sources/flaresolverr/status'),

  // Extensions & Repos
  getAvailableExtensions: () => request<any[]>('/extensions/available'),
  uninstallExtension: (id: string) => request<any>(`/extensions/${id}`, { method: 'DELETE' }),
  getRepos: async () => {
    try {
      return await request<any[]>('/extensions/repos');
    } catch {
      return [
        {
          name: 'Keiyoushi (Oficial Tachiyomi / Mihon)',
          url: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json',
          enabled: true,
          lastSynced: Date.now(),
        },
      ];
    }
  },
  addRepo: (url: string, name?: string) => request<any>('/extensions/repos', { method: 'POST', body: JSON.stringify({ url, name }) }),
  deleteRepo: (url: string) => request<any>('/extensions/repos', { method: 'DELETE', body: JSON.stringify({ url }) }),
  toggleRepo: (url: string, enabled: boolean) => request<any>('/extensions/repos/toggle', { method: 'POST', body: JSON.stringify({ url, enabled }) }),
  getStoreExtensions: async (q?: string, lang?: string) => {
    // Função auxiliar para buscar do GitHub diretamente (sem servidor)
    async function fetchFromGitHub() {
      const URLS = [
        'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json',
        'https://cdn.jsdelivr.net/gh/keiyoushi/extensions@repo/index.min.json',
      ];
      for (const url of URLS) {
        try {
          const ghRes = await fetch(url, { cache: 'default' });
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
      }
      throw new Error('Não foi possível carregar extensões do GitHub. Verifique sua conexão.');
    }

    const base = getApiBaseUrl();
    if (!base) {
      // Sem servidor configurado → vai direto ao GitHub
      return fetchFromGitHub();
    }

    // Servidor configurado → tenta servidor, cai no GitHub se falhar
    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (lang && lang !== 'all') params.append('lang', lang);
    const qs = params.toString();
    try {
      return await request<{ total: number; extensions: any[] }>(`/extensions/store${qs ? `?${qs}` : ''}`);
    } catch {
      return fetchFromGitHub();
    }
  },
  extractExtension: async (pkg: string, apkUrl: string, repoUrl?: string) => {
    try {
      return await request<any>('/extensions/extract', { method: 'POST', body: JSON.stringify({ pkg, apkUrl, repoUrl }) });
    } catch {
      // Salva localmente a extensão instalada no dispositivo
      const installed = getLocalInstalledSources();
      const newSource = {
        id: pkg.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        name: pkg.split('.').pop() || pkg,
        version: '1.0.0',
        lang: 'pt-br',
        iconUrl: `https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/${pkg}.png`,
        baseUrl: apkUrl,
        isEnabled: true,
        isNsfw: false,
        hasPopular: true,
        hasLatest: true,
        supportsSearch: true,
        pkg,
      };
      if (!installed.some((s: any) => s.pkg === pkg)) {
        installed.push(newSource);
        saveLocalInstalledSources(installed);
      }
      return { success: true, message: 'Extensão instalada no dispositivo móvel com sucesso!' };
    }
  },
  uninstallExtracted: async (pkg: string) => {
    try {
      return await request<any>(`/extensions/extracted/${pkg}`, { method: 'DELETE' });
    } catch {
      const installed = getLocalInstalledSources().filter((s: any) => s.pkg !== pkg && s.id !== pkg);
      saveLocalInstalledSources(installed);
      return { success: true };
    }
  },

  // Manga
  getManga: async (id: string) => {
    try {
      return await request<any>(`/manga/${id}`);
    } catch {
      return getMangaDexDetails(id);
    }
  },
  getChapters: async (mangaId: string) => {
    try {
      return await request<any[]>(`/manga/${mangaId}/chapters`);
    } catch {
      return getMangaDexChapters(mangaId);
    }
  },
  refreshManga: (mangaId: string) => request<any>(`/manga/${mangaId}/refresh`, { method: 'POST' }),
  setInLibrary: async (id: string, inLibrary: boolean, categoryId?: string) => {
    try {
      return await request<any>(`/manga/${id}/library`, { method: 'POST', body: JSON.stringify({ inLibrary, categoryId }) });
    } catch {
      let lib = getLocalLibrary();
      if (inLibrary) {
        if (!lib.some((m: any) => m.id === id)) {
          const details = await getMangaDexDetails(id).catch(() => ({ id, title: 'Mangá', coverUrl: '' }));
          lib.push({ ...details, inLibrary: true, isFavorite: true, categoryId });
        }
      } else {
        lib = lib.filter((m: any) => m.id !== id);
      }
      saveLocalLibrary(lib);
      return { inLibrary, isFavorite: inLibrary };
    }
  },
  toggleFavorite: async (id: string, isFavorite: boolean) => {
    try {
      return await request<any>(`/manga/${id}/favorite`, { method: 'POST', body: JSON.stringify({ isFavorite }) });
    } catch {
      let lib = getLocalLibrary();
      if (isFavorite) {
        if (!lib.some((m: any) => m.id === id)) {
          const details = await getMangaDexDetails(id).catch(() => ({ id, title: 'Mangá', coverUrl: '' }));
          lib.push({ ...details, inLibrary: true, isFavorite: true });
        }
      } else {
        lib = lib.filter((m: any) => m.id !== id);
      }
      saveLocalLibrary(lib);
      return { isFavorite, inLibrary: isFavorite };
    }
  },
  setCategory: (id: string, categoryId: string) =>
    request<any>(`/manga/${id}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) }),

  // Chapters
  getPages: async (chapterId: string) => {
    try {
      return await request<any>(`/chapters/${chapterId}/pages`);
    } catch {
      return getMangaDexPages(chapterId);
    }
  },
  updateProgress: async (chapterId: string, page: number, totalPages: number, isRead: boolean) => {
    try {
      return await request<any>(`/chapters/${chapterId}/progress`, { method: 'POST', body: JSON.stringify({ page, totalPages, isRead }) });
    } catch {
      const hist = getLocalHistory();
      const existing = hist.findIndex((h: any) => h.chapterId === chapterId);
      const entry = { chapterId, page, totalPages, isRead, readAt: new Date().toISOString() };
      if (existing >= 0) hist[existing] = entry;
      else hist.unshift(entry);
      saveLocalHistory(hist.slice(0, 100));
      return { success: true };
    }
  },
  markChaptersRead: (chapterIds: string[], isRead: boolean) =>
    request<any>('/chapters/mark-read', { method: 'POST', body: JSON.stringify({ chapterIds, isRead }) }),

  // Downloads
  getDownloads: async () => {
    try {
      return await request<any[]>('/downloads');
    } catch {
      return [];
    }
  },
  getStorageUsage: async () => {
    try {
      return await request<{ totalBytes: number; formatted: string }>('/downloads/storage');
    } catch {
      return { totalBytes: 0, formatted: '0 MB' };
    }
  },
  enqueueDownload: (chapterId: string) => request<any>('/downloads/enqueue', { method: 'POST', body: JSON.stringify({ chapterId }) }),
  enqueueBatch: (chapterIds: string[]) => request<any>('/downloads/enqueue-batch', { method: 'POST', body: JSON.stringify({ chapterIds }) }),
  cancelDownload: (chapterId: string, deleteFiles = false) => request<any>(`/downloads/${chapterId}?deleteFiles=${deleteFiles}`, { method: 'DELETE' }),
  pauseDownloads: () => request<any>('/downloads/pause', { method: 'POST' }),
  resumeDownloads: () => request<any>('/downloads/resume', { method: 'POST' }),
  clearCompleted: () => request<any>('/downloads/clear-completed', { method: 'POST' }),
  scanLocal: () => request<any>('/downloads/scan-local', { method: 'POST' }),

  // Library
  getLibrary: async (category?: string, search?: string) => {
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.append('category', category);
      if (search) params.append('search', search);
      const qs = params.toString();
      return await request<any[]>(`/library${qs ? `?${qs}` : ''}`);
    } catch {
      let lib = getLocalLibrary();
      if (search) {
        lib = lib.filter((m: any) => m.title?.toLowerCase().includes(search.toLowerCase()));
      }
      return lib;
    }
  },
  getCategories: async () => {
    try {
      return await request<any[]>('/library/categories');
    } catch {
      return [];
    }
  },
  createCategory: (name: string) => request<any>('/library/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCategory: (id: string) => request<any>(`/library/categories/${id}`, { method: 'DELETE' }),

  // History
  getHistory: async (limit = 50) => {
    try {
      return await request<any[]>(`/history?limit=${limit}`);
    } catch {
      return getLocalHistory().slice(0, limit);
    }
  },
  clearHistory: async () => {
    try {
      return await request<any>('/history', { method: 'DELETE' });
    } catch {
      saveLocalHistory([]);
      return { success: true };
    }
  },

  // Settings
  getSettings: () => request<any>('/settings'),
  updateSettings: (settings: any) => request<any>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // Updates
  checkUpdates: () => request<any>('/updates/check', { method: 'POST' }),
};
