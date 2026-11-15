import { TachiyomiNative, checkIsNative, getConfigurableSources, sourceNeedsConfiguration, clearConfigurableSourcesCache, type ConfigurableSourceInfo, type NativeResponse } from './nativeBridge';

// Helper para lidar com respostas nativas de forma consistente
async function handleNativeResponse<T>(promise: Promise<NativeResponse<T>>): Promise<T> {
  const res = await promise;
  if (res?.error) {
    throw new Error(res.message || 'Erro na operação nativa');
  }
  return res as T;
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  // No APK, o OmniYomi é standalone. Ignore URLs antigas salvas pelo site/desktop
  // para nenhuma operação mobile voltar silenciosamente a depender de um servidor.
  if (isCapacitorApp()) return '';

  // Navegador/desktop: servidor opcional existente continua suportado.
  const stored = localStorage.getItem('omniyomi_server_url');
  if (stored && stored.trim().length > 0) return stored.replace(/\/$/, '');

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    if (window.location.port === '8888' || window.location.port === '4567') {
      return window.location.origin;
    }
  }

  return '';
}

export function isCapacitorApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'capacitor:' ||
    Boolean((window as any).Capacitor?.isNativePlatform?.())
  );
}

export function isServerConfigured(): boolean {
  if (typeof window === 'undefined' || isCapacitorApp()) return false;
  const stored = localStorage.getItem('omniyomi_server_url');
  return Boolean(stored && stored.trim().length > 0);
}

export function setApiBaseUrl(url: string) {
  // O APK não aceita configuração de servidor: sua arquitetura é local/standalone.
  if (isCapacitorApp() || !url) {
    localStorage.removeItem('omniyomi_server_url');
    return;
  }
  localStorage.setItem('omniyomi_server_url', url.trim().replace(/\/$/, ''));
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('file://')) {
    if (typeof window !== 'undefined' && (window as any).Capacitor?.convertFileSrc) {
      return (window as any).Capacitor.convertFileSrc(pathOrUrl);
    }
    return pathOrUrl;
  }
  if (
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://') ||
    pathOrUrl.startsWith('blob:') ||
    pathOrUrl.startsWith('data:') ||
    pathOrUrl.startsWith('capacitor://')
  ) {
    return pathOrUrl;
  }
  const base = getApiBaseUrl();
  if (!base) return pathOrUrl;
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

function getLocalCategories(): any[] {
  try {
    const stored = JSON.parse(localStorage.getItem('omniyomi_local_categories') || 'null');
    if (Array.isArray(stored)) return stored;
  } catch {}
  return [
    { id: 'default', name: 'Padrão' },
    { id: 'favorites', name: 'Favoritos' },
  ];
}

function saveLocalCategories(categories: any[]) {
  try {
    localStorage.setItem('omniyomi_local_categories', JSON.stringify(categories));
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

// Função auxiliar para gerar hash determinístico de uma string
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
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
    index: idx + 1,
    pageNumber: idx + 1,
    url: `${baseUrl}/data/${hash}/${file}`,
    imageUrl: `${baseUrl}/data/${hash}/${file}`,
  }));
  return { chapterId, totalPages: pages.length, pages };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();
  // Se não houver servidor configurado, não faz chamada relativa (evita receber index.html estático)
  if (!base) {
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

// Repositórios oficiais e comunitários compatíveis com o ecossistema Tachiyomi / Mihon
export const DEFAULT_REPOSITORIES = [
  {
    id: 'keiyoushi',
    name: 'Keiyoushi (Oficial Tachiyomi / Mihon)',
    url: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.pb',
    originalUrl: 'https://github.com/keiyoushi/extensions/raw/repo/index.pb',
    enabled: true,
    lastSynced: Date.now(),
  },
  {
    id: 'felipegfa',
    name: 'FelipeGFA (Repositório BR de Extensões)',
    url: 'https://raw.githubusercontent.com/FelipeGFA/extensoes/refs/heads/repo/index.pb',
    originalUrl: 'https://raw.githubusercontent.com/FelipeGFA/extensoes/refs/heads/repo/index.pb',
    enabled: true,
    lastSynced: Date.now(),
  },
  {
    id: 'cursed',
    name: 'Cursed Yūzōnō (Manga & Cursed)',
    url: 'https://raw.githubusercontent.com/mojuru/cursed-manga-repo/repo/index.pb',
    originalUrl: 'https://raw.githubusercontent.com/mojuru/cursed-manga-repo/repo/index.pb',
    enabled: true,
    lastSynced: Date.now(),
  },
  {
    id: 'suwayomi',
    name: 'Suwayomi (Tachidesk Extensions)',
    url: 'https://raw.githubusercontent.com/Suwayomi/tachiyomi-extension/repo/index.min.json',
    originalUrl: 'https://raw.githubusercontent.com/Suwayomi/tachiyomi-extension/repo/index.min.json',
    enabled: true,
    lastSynced: Date.now(),
  },
  {
    id: 'kareadita',
    name: 'Kareadita (Kavita Extensions)',
    url: 'https://raw.githubusercontent.com/Kareadita/tach-extension/repo/index.min.json',
    originalUrl: 'https://raw.githubusercontent.com/Kareadita/tach-extension/repo/index.min.json',
    enabled: true,
    lastSynced: Date.now(),
  },
];

type ProtoField = {
  number: number;
  wireType: number;
  value?: bigint;
  bytes?: Uint8Array;
};

function readProtoVarint(bytes: Uint8Array, start: number): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  let offset = start;

  while (offset < bytes.length && shift <= 70n) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: offset };
    shift += 7n;
  }

  throw new Error('Índice Protobuf inválido: varint incompleto ou excessivo.');
}

function readProtoFields(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const tag = readProtoVarint(bytes, offset);
    offset = tag.next;

    const number = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 7n);
    if (!number) throw new Error('Índice Protobuf inválido: número de campo zero.');

    if (wireType === 0) {
      const decoded = readProtoVarint(bytes, offset);
      fields.push({ number, wireType, value: decoded.value });
      offset = decoded.next;
    } else if (wireType === 2) {
      const length = readProtoVarint(bytes, offset);
      offset = length.next;
      if (length.value > BigInt(bytes.length - offset)) {
        throw new Error('Índice Protobuf inválido: campo excede o tamanho do arquivo.');
      }
      const end = offset + Number(length.value);
      fields.push({ number, wireType, bytes: bytes.subarray(offset, end) });
      offset = end;
    } else if (wireType === 1) {
      if (offset + 8 > bytes.length) throw new Error('Índice Protobuf inválido: campo fix64 truncado.');
      offset += 8;
    } else if (wireType === 5) {
      if (offset + 4 > bytes.length) throw new Error('Índice Protobuf inválido: campo fix32 truncado.');
      offset += 4;
    } else {
      throw new Error(`Índice Protobuf inválido: wire type ${wireType} não suportado.`);
    }

    fields.push(...[]);
  }

  return fields;
}

function protoText(field?: ProtoField): string {
  return field?.bytes ? new TextDecoder().decode(field.bytes) : '';
}

function protoFirst(fields: ProtoField[], number: number): ProtoField | undefined {
  return fields.find(field => field.number === number);
}

function protoStrings(fields: ProtoField[], number: number): string[] {
  return fields.filter(field => field.number === number && field.wireType === 2)
    .map(field => protoText(field));
}

function parseProtoSource(bytes: Uint8Array): any {
  const fields = readProtoFields(bytes);
  const id = protoFirst(fields, 1)?.value ?? 0n;
  return {
    id: id.toString(),
    name: protoText(protoFirst(fields, 2)),
    language: protoText(protoFirst(fields, 3)),
    homeUrl: protoText(protoFirst(fields, 4)),
    mirrorUrls: protoStrings(fields, 5),
    contentRating: Number(protoFirst(fields, 6)?.value ?? 0n),
    message: protoText(protoFirst(fields, 7)),
  };
}

function parseProtoExtension(bytes: Uint8Array): any {
  const fields = readProtoFields(bytes);
  const resourceBytes = protoFirst(fields, 3)?.bytes;
  const resources = resourceBytes ? readProtoFields(resourceBytes) : [];
  const sourceFields = fields.filter(field => field.number === 7 && field.bytes);
  const sources = sourceFields.map(field => parseProtoSource(field.bytes!));

  return {
    name: protoText(protoFirst(fields, 1)),
    packageName: protoText(protoFirst(fields, 2)),
    resources: {
      apkUrl: protoText(protoFirst(resources, 1)),
      iconUrl: protoText(protoFirst(resources, 2)),
    },
    extensionLib: protoText(protoFirst(fields, 4)),
    versionCode: (protoFirst(fields, 5)?.value ?? 0n).toString(),
    versionName: protoText(protoFirst(fields, 6)),
    // Enum ContentRating: SAFE=0, SUGGESTIVE=1, EROTICA=2, PORNOGRAPHIC=3.
    contentWarning: sources.some((source: any) => source.contentRating >= 2) ? 3 : 0,
    sources,
  };
}

function parseExtensionIndexProto(bytes: Uint8Array): { extensions: any[]; name?: string; signingKey?: string } {
  const fields = readProtoFields(bytes);
  const extensions = fields
    .filter(field => field.number === 5 && field.wireType === 2 && field.bytes)
    .map(field => parseProtoExtension(field.bytes!));

  return {
    name: protoText(protoFirst(fields, 1)),
    signingKey: protoText(protoFirst(fields, 3)),
    extensions,
  };
}

async function decompressExtensionIndex(bytes: Uint8Array): Promise<Uint8Array> {
  // Mihon/Keiyoushi publica index.pb comprimido com gzip.
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return bytes;

  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'Este Android WebView não oferece descompactação gzip nativa. Atualize o Android System WebView para ler index.pb.'
    );
  }

  // Copiar para ArrayBuffer próprio: Uint8Array pode ser tipado com ArrayBufferLike
  // (incluindo SharedArrayBuffer), que não é um BlobPart aceito pelo TypeScript.
  const ownedBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ownedBuffer).set(bytes);
  const compressed = new Blob([ownedBuffer]).stream();
  const decompressed = compressed.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(decompressed).arrayBuffer());
}

async function parseExtensionRepositoryResponse(url: string, response: Response): Promise<any[]> {
  if (url.toLowerCase().endsWith('.pb')) {
    try {
      const downloaded = new Uint8Array(await response.arrayBuffer());
      const bytes = await decompressExtensionIndex(downloaded);
      const parsed = parseExtensionIndexProto(bytes);
      if (parsed.extensions.length > 0) return parsed.extensions;
      throw new Error('Index.extensions vazio ou ausente.');
    } catch (protobufError: any) {
      // Fallback oficial do catálogo legível do mesmo repositório. Isso também
      // cobre WebViews antigas sem DecompressionStream, sem marcar o .pb como JSON.
      const jsonUrl = url.replace(/index\.pb$/i, 'index.json');
      if (jsonUrl === url) throw protobufError;
      const jsonResponse = await fetch(jsonUrl, { cache: 'no-cache' });
      if (!jsonResponse.ok) {
        throw new Error(
          `Falha ao ler index.pb (${protobufError?.message || protobufError}) e index.json (HTTP ${jsonResponse.status}).`
        );
      }
      return parseExtensionRepositoryResponse(jsonUrl, jsonResponse);
    }
  }

  const data = await response.json();
  return data.extensionList?.extensions || (Array.isArray(data) ? data : []);
}

export function normalizeRepoUrl(raw: string): string {
  let u = (raw || '').trim();
  if (u.includes('github.com') && u.includes('/raw/')) {
    u = u.replace('github.com', 'raw.githubusercontent.com').replace('/raw/', '/');
  }
  // Preserve index.pb: ele é Protobuf e precisa ser decodificado como binário.
  return u;
}

function getLocalRepositories(): any[] {
  try {
    const stored = localStorage.getItem('omniyomi_repositories');
    if (!stored) {
      saveLocalRepositories(DEFAULT_REPOSITORIES);
      return DEFAULT_REPOSITORIES;
    }

    const parsed = JSON.parse(stored);
    const savedById = new Map<string, any>(
      (Array.isArray(parsed) ? parsed : []).map((repo: any) => [String(repo.id || repo.url), repo])
    );
    const defaults = new Map<string, any>();

    // Migra URLs antigas pelo ID estável do repositório. Isso troca automaticamente
    // o Keiyoushi index.json legado pelo index.pb sem perder enabled/lastSynced.
    for (const repo of DEFAULT_REPOSITORIES) {
      const saved = savedById.get(String(repo.id));
      defaults.set(String(repo.id), saved
        ? { ...repo, ...saved, url: repo.url, originalUrl: repo.originalUrl }
        : repo);
      savedById.delete(String(repo.id));
    }

    // Preserva repositórios personalizados que não fazem parte dos padrões.
    for (const [id, repo] of savedById.entries()) {
      if (repo?.url) defaults.set(id, repo);
    }

    const result = Array.from(defaults.values());
    saveLocalRepositories(result);
    return result;
  } catch {
    return DEFAULT_REPOSITORIES;
  }
}

function saveLocalRepositories(repos: any[]) {
  try {
    localStorage.setItem('omniyomi_repositories', JSON.stringify(repos));
  } catch {}
}
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
  health: async () => {
    if (await checkIsNative()) return { status: 'ok', version: '1.1.8', app: 'OmniYomi Android (standalone)' };
    return request<{ status: string; version: string; app: string }>('/health');
  },

  // Sources
  getSources: async () => {
    // Android: fontes exibidas são apenas as que o runtime nativo realmente carregou.
    // Não misture fontes de catálogo estático, slugs de pacote ou registros antigos/falsos.
    if (await checkIsNative()) {
      const [nativeRes, savedSources] = await Promise.all([
        TachiyomiNative.getInstalledSources(),
        Promise.resolve(getLocalInstalledSources()),
      ]);
      const savedById = new Map<string, any>(
        savedSources.map((source: any) => [String(source.id), source])
      );
      const map = new Map<string, any>();

      for (const nativeSource of nativeRes?.sources || []) {
        const id = String(nativeSource.id);
        const saved = savedById.get(id) || {};
        map.set(id, {
          ...saved,
          id,
          nativeSourceId: id,
          name: nativeSource.name || saved.name || id,
          version: saved.version || 'unknown',
          lang: nativeSource.lang || saved.lang || 'all',
          iconUrl: saved.iconUrl || '',
          baseUrl: saved.baseUrl || '',
          pkg: saved.pkg,
          isEnabled: saved.isEnabled !== false,
          isNative: true,
          isInstalled: true,
          hasPopular: true,
          hasLatest: Boolean(nativeSource.supportsLatest ?? true),
          supportsSearch: true,
        });
      }

      // MangaDex é a única fonte HTTP embutida; as demais precisam vir do runtime.
      const mangaDex = DEFAULT_POPULAR_SOURCES.find((source: any) => source.id === 'mangadex');
      if (mangaDex) map.set('mangadex', mangaDex);

      return Array.from(map.values());
    }

    // Navegador: mantém a integração atual com o servidor quando configurado.
    try {
      const serverSources = await request<any[]>('/sources');
      if (Array.isArray(serverSources) && serverSources.length > 0) return serverSources;
    } catch {}

    const locals = getLocalInstalledSources();
    const map = new Map<string, any>();
    DEFAULT_POPULAR_SOURCES.forEach(source => map.set(source.id, source));
    locals.forEach((source: any) => map.set(source.id, source));
    return Array.from(map.values());
  },
  getPopular: async (sourceId: string, page = 1) => {
    // MangaDex: usa a API diretamente
    if (sourceId === 'mangadex') {
      return fetchMangaDexPopular(page);
    }
    // Android nativo: usa a extensão instalada
    if (await checkIsNative()) {
      if (await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      return handleNativeResponse(TachiyomiNative.getPopularManga({ sourceId, page }));
    }
    // Web com servidor configurado
    try {
      return await request<any>(`/sources/${sourceId}/popular?page=${page}`);
    } catch {
      throw new Error(`Fonte "${sourceId}" não disponível. Instale a extensão primeiro ou configure o servidor.`);
    }
  },
  getLatest: async (sourceId: string, page = 1) => {
    if (sourceId === 'mangadex') {
      return fetchMangaDexPopular(page);
    }
    if (await checkIsNative()) {
      if (await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      return handleNativeResponse(TachiyomiNative.getLatestManga({ sourceId, page }));
    }
    return request<any>(`/sources/${sourceId}/latest?page=${page}`);
  },
  searchSource: async (sourceId: string, q: string, page = 1) => {
    if (sourceId === 'mangadex') {
      return searchMangaDex(q, page);
    }
    if (await checkIsNative()) {
      if (await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      const res = await handleNativeResponse(TachiyomiNative.searchManga({ sourceId, query: q, page }));
      if (res?.manga?.length > 0) return res;
      return { manga: [], hasNextPage: false };
    }
    try {
      return await request<any>(`/sources/${sourceId}/search?q=${encodeURIComponent(q)}&page=${page}`);
    } catch {
      throw new Error(`Fonte "${sourceId}" não disponível para pesquisa.`);
    }
  },
  checkSourceHealth: async (id: string) => {
    if (await checkIsNative()) {
      if (await sourceNeedsConfiguration(id)) {
        return {
          status: 'ERROR',
          message: `Esta extensão requer configuração. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`,
        };
      }
      try {
        const result = await handleNativeResponse(TachiyomiNative.getPopularManga({ sourceId: id, page: 1 }));
        const count = result?.manga?.length || 0;
        return {
          status: 'OK',
          message: `Fonte executada localmente: ${count} obra(s) retornadas.`,
        };
      } catch (error: any) {
        return {
          status: 'ERROR',
          message: error?.message || 'Falha ao executar a extensão neste aparelho.',
        };
      }
    }
    return request<any>(`/sources/${encodeURIComponent(id)}/health`);
  },
  toggleSource: async (id: string, enabled: boolean) => {
    if (await checkIsNative()) {
      const installed = getLocalInstalledSources();
      const index = installed.findIndex((source: any) => String(source.id) === String(id));
      if (index < 0) throw new Error(`Fonte ${id} não encontrada nos metadados locais.`);
      installed[index] = { ...installed[index], isEnabled: enabled };
      saveLocalInstalledSources(installed);
      return { success: true, enabled };
    }
    return request<any>(`/sources/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },
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
  getFlareSolverrStatus: async () => {
    if (await checkIsNative()) return { available: false, message: 'FlareSolverr é um serviço externo opcional e não está disponível no modo Android independente.' };
    return request<{ available: boolean; message: string; version?: string }>('/sources/flaresolverr/status');
  },

  // Extensions & Repos
  getAvailableExtensions: async () => {
    if (await checkIsNative()) {
      const store = await api.getStoreExtensions();
      return store.extensions || [];
    }
    return request<any[]>('/extensions/available');
  },
  uninstallExtension: async (id: string) => {
    if (await checkIsNative()) return api.uninstallExtracted(id);
    return request<any>(`/extensions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getRepos: async () => {
    if (await checkIsNative()) return getLocalRepositories();
    try {
      const serverRepos = await request<any[]>('/extensions/repos');
      if (Array.isArray(serverRepos) && serverRepos.length > 0) return serverRepos;
    } catch {}
    return getLocalRepositories();
  },
  addRepo: async (url: string, name?: string) => {
    try {
      return await request<any>('/extensions/repos', { method: 'POST', body: JSON.stringify({ url, name }) });
    } catch {
      const repos = getLocalRepositories();
      const cleanUrl = url.trim();
      const normalized = normalizeRepoUrl(cleanUrl);
      const existing = repos.find(r => r.url === normalized || r.originalUrl === cleanUrl);
      if (existing) {
        existing.enabled = true;
      } else {
        const repoName = name?.trim() || cleanUrl.split('/')[4] || 'Novo Repositório';
        repos.push({
          id: 'repo_' + Date.now(),
          name: repoName,
          url: normalized,
          originalUrl: cleanUrl,
          enabled: true,
          lastSynced: Date.now(),
        });
      }
      saveLocalRepositories(repos);
      return { success: true, message: 'Repositório adicionado!' };
    }
  },
  deleteRepo: async (url: string) => {
    try {
      return await request<any>('/extensions/repos', { method: 'DELETE', body: JSON.stringify({ url }) });
    } catch {
      const repos = getLocalRepositories().filter(r => r.url !== url && r.originalUrl !== url);
      saveLocalRepositories(repos);
      return { success: true };
    }
  },
  toggleRepo: async (url: string, enabled: boolean) => {
    try {
      return await request<any>('/extensions/repos/toggle', { method: 'POST', body: JSON.stringify({ url, enabled }) });
    } catch {
      const repos = getLocalRepositories();
      const r = repos.find(item => item.url === url || item.originalUrl === url);
      if (r) {
        r.enabled = enabled;
        saveLocalRepositories(repos);
      }
      return { success: true, enabled };
    }
  },
  getStoreExtensions: async (q?: string, lang?: string, repoFilter?: string) => {
    // Busca e unifica as extensões de todos os repositórios ativos diretamente no GitHub
    async function fetchFromActiveRepos() {
      const repos = getLocalRepositories().filter((r: any) => r.enabled);
      const installedList = getLocalInstalledSources();
      const allExtensions: any[] = [];

      await Promise.allSettled(
        repos.map(async (repo: any) => {
          if (repoFilter && repoFilter !== 'all' && repo.url !== repoFilter && repo.originalUrl !== repoFilter) {
            return;
          }
          const primaryUrl = normalizeRepoUrl(repo.url);
          const candidates = [primaryUrl];
          if (primaryUrl.endsWith('index.min.json')) {
            candidates.push(primaryUrl.replace('index.min.json', 'index.json'));
          }

          for (const u of candidates) {
            try {
              const res = await fetch(u, { cache: 'default' });
              if (!res.ok) continue;
              const rawList: any[] = await parseExtensionRepositoryResponse(u, res);

              // Se o index.min.json contiver apenas o aviso de app desatualizado, tenta o próximo candidato
              if (
                rawList.length <= 2 &&
                rawList.some((e: any) =>
                  e.name?.toLowerCase().includes('outdated') ||
                  e.name?.toLowerCase().includes('desatualizado')
                )
              ) {
                continue;
              }

              const repoBaseUrl = u.substring(0, u.lastIndexOf('/'));

              rawList.forEach((e: any) => {
                const pkg = e.packageName || e.pkg || '';
                let extLang = e.lang;
                if (!extLang && e.sources && e.sources.length > 0) {
                  extLang = e.sources[0].language || e.sources[0].lang;
                }
                if (!extLang) {
                  if (pkg.includes('.pt.') || pkg.includes('.pt-br.')) extLang = 'pt-br';
                  else if (pkg.includes('.en.')) extLang = 'en';
                  else if (pkg.includes('.es.')) extLang = 'es';
                  else if (pkg.includes('.all.')) extLang = 'all';
                  else extLang = 'all';
                }
                if (extLang === 'pt-BR') extLang = 'pt-br';

                const warning = e.contentWarning;
                const isNsfw = warning === 'CONTENT_WARNING_NSFW' || warning === 3 || Boolean(e.isNsfw || e.nsfw);
                const iconUrl =
                  e.resources?.iconUrl ||
                  (pkg ? `${repoBaseUrl}/icon/${pkg}.png` : '') ||
                  `https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/${pkg}.png`;
                const apkUrl =
                  e.resources?.apkUrl ||
                  (e.apk ? `${repoBaseUrl}/apk/${e.apk}` : '');
                const isInstalled = installedList.some((s: any) => s.pkg === pkg || s.id === pkg);

                const sources = (e.sources || []).map((s: any) => ({
                  id: String(s.id),
                  name: s.name,
                  baseUrl: s.homeUrl || s.baseUrl || '',
                  lang: s.language || s.lang || extLang,
                }));

                allExtensions.push({
                  name: e.name,
                  pkg,
                  version: e.versionName || e.version || '1.0.0',
                  versionCode: String(e.versionCode || ''),
                  extensionLib: String(e.extensionLib || e.libVersion || ''),
                  lang: extLang,
                  isNsfw,
                  iconUrl,
                  apkUrl,
                  isInstalled,
                  repoName: repo.name,
                  repoUrl: repo.url,
                  sources,
                });
              });
              break; // Obteve as extensões com sucesso deste repositório
            } catch {}
          }
        })
      );

      // Elimina duplicatas de pacotes mantendo o repositório principal
      const dedupMap = new Map<string, any>();
      allExtensions.forEach(ext => {
        if (!dedupMap.has(ext.pkg)) {
          dedupMap.set(ext.pkg, ext);
        }
      });
      let list = Array.from(dedupMap.values());

      // Filtro de idioma
      if (lang && lang !== 'all') {
        const targetLang = lang.toLowerCase();
        list = list.filter((e: any) => {
          if (e.lang?.toLowerCase() === targetLang || e.lang === 'all') return true;
          return e.sources?.some((s: any) => s.lang?.toLowerCase().startsWith(targetLang));
        });
      }

      // Filtro de busca textual
      if (q && q.trim()) {
        const query = q.toLowerCase();
        list = list.filter((e: any) =>
          e.name?.toLowerCase().includes(query) ||
          e.pkg?.toLowerCase().includes(query) ||
          e.repoName?.toLowerCase().includes(query) ||
          e.sources?.some((s: any) => s.name?.toLowerCase().includes(query))
        );
      }

      return { total: list.length, extensions: list };
    }

    const base = getApiBaseUrl();
    if (!base) {
      return fetchFromActiveRepos();
    }

    const params = new URLSearchParams();
    if (q) params.append('q', q);
    if (lang && lang !== 'all') params.append('lang', lang);
    const qs = params.toString();
    try {
      return await request<{ total: number; extensions: any[] }>(`/extensions/store${qs ? `?${qs}` : ''}`);
    } catch {
      return fetchFromActiveRepos();
    }
  },
  extractExtension: async (pkg: string, apkUrl: string, repoUrl?: string, extData?: any) => {
    // Android: uma falha no runtime nativo NÃO pode virar uma instalação simulada.
    // Só registramos fontes retornadas pelo ExtensionManager após carregamento real.
    if (await checkIsNative()) {
      const declaredLib = String(extData?.extensionLib || '').trim();
      if (declaredLib && !declaredLib.startsWith('1.4') && !declaredLib.startsWith('1.6')) {
        throw new Error(
          `A extensão ${pkg} exige extensionLib ${declaredLib}. O runtime desta versão declara compatibilidade com as ABIs 1.4 e 1.6; a extensão não será marcada como instalada.`
        );
      }

      const res = await TachiyomiNative.installExtension({ apkUrl, pkg });
      const nativeSources = Array.isArray(res?.sources) ? res.sources : [];

      if (!res?.success) {
        throw new Error(`O Android não confirmou a instalação de ${pkg}.`);
      }
      if (nativeSources.length === 0) {
        throw new Error(
          `O APK ${pkg} foi baixado, mas o runtime nativo não retornou nenhuma fonte carregada. ` +
          'A extensão não será marcada como instalada. Verifique compatibilidade do runtime e metadados do APK.'
        );
      }

      const invalidSources = nativeSources.filter((s: any) =>
        s?.id === undefined || s?.id === null || !/^[0-9]+$/.test(String(s.id))
      );
      if (invalidSources.length > 0) {
        throw new Error(
          `O runtime retornou IDs de fonte inválidos para ${pkg}. ` +
          'O OmniYomi exige os IDs reais retornados pela implementação da extensão.'
        );
      }

      const installed = getLocalInstalledSources();
      const cleanName = extData?.name || pkg.split('.').pop() || pkg;
      const icon = extData?.iconUrl || `https://raw.githubusercontent.com/keiyoushi/extensions/repo/icon/${pkg}.png`;
      const lang = extData?.lang || (pkg.includes('.pt.') ? 'pt-br' : 'en');

      for (const src of nativeSources) {
        const realId = String(src.id);
        const existingIdx = installed.findIndex((s: any) => s.id === realId);
        const newSource = {
          id: realId,
          nativeSourceId: realId,
          name: src.name || cleanName,
          version: extData?.version || '1.0.0',
          versionCode: String(extData?.versionCode || ''),
          extensionLib: String(extData?.extensionLib || ''),
          lang: src.lang || lang,
          iconUrl: icon,
          baseUrl: src.baseUrl || src.homeUrl || '',
          isEnabled: true,
          isNsfw: Boolean(extData?.isNsfw),
          hasPopular: true,
          hasLatest: true,
          supportsSearch: true,
          pkg,
          repoUrl: repoUrl || extData?.repoUrl || '',
          isNative: true,
        };
        if (existingIdx >= 0) installed[existingIdx] = newSource;
        else installed.push(newSource);
      }

      saveLocalInstalledSources(installed);
      return {
        success: true,
        pkg,
        sources: nativeSources,
        message: `Extensão ${cleanName} instalada e carregada pelo runtime nativo.`,
      };
    }

    // Navegador/desktop: mantém o fluxo de backend existente.
    try {
      return await request<any>('/extensions/extract', {
        method: 'POST',
        body: JSON.stringify({ pkg, apkUrl, repoUrl }),
      });
    } catch {
      throw new Error(
        'A instalação de APKs de extensões Tachiyomi exige o runtime Android. ' +
        'Não é seguro registrar uma extensão apenas com os metadados do repositório.'
      );
    }
  },
  uninstallExtracted: async (pkg: string) => {
    if (await checkIsNative()) {
      const result = await TachiyomiNative.uninstallExtension({ pkg });
      const installed = getLocalInstalledSources().filter((source: any) => source.pkg !== pkg);
      saveLocalInstalledSources(installed);
      return result || { success: true };
    }
    return request<any>(`/extensions/extracted/${encodeURIComponent(pkg)}`, { method: 'DELETE' });
  },

  // Manga
  getManga: async (id: string, sourceId?: string) => {
    // MangaDex: usa diretamente
    if (!sourceId || sourceId === 'mangadex') {
      try {
        return await getMangaDexDetails(id);
      } catch (e: any) {
        throw new Error(`MangaDex: ${e.message}`);
      }
    }
    // Android nativo
    if (await checkIsNative()) {
      if (sourceId && await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      const nat = await handleNativeResponse(TachiyomiNative.getMangaDetails({ sourceId, mangaUrl: id }));
      if (nat && nat.title) return nat;
      throw new Error(`Extensão "${sourceId}" não retornou detalhes.`);
    }
    // Servidor
    try {
      return await request<any>(`/manga/${id}`);
    } catch {
      throw new Error(`Mangá não encontrado. Fonte "${sourceId}" indisponível.`);
    }
  },
  getChapters: async (mangaId: string, sourceId?: string) => {
    if (!sourceId || sourceId === 'mangadex') {
      return getMangaDexChapters(mangaId);
    }
    if (await checkIsNative()) {
      if (sourceId && await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      const nat = await handleNativeResponse(TachiyomiNative.getChapterList({ sourceId, mangaUrl: mangaId }));
      if (nat?.chapters?.length > 0) return nat.chapters;
      return [];
    }
    try {
      return await request<any[]>(`/manga/${mangaId}/chapters`);
    } catch {
      throw new Error(`Capítulos não disponíveis. Fonte "${sourceId}" indisponível.`);
    }
  },
  refreshManga: async (mangaId: string, sourceId?: string) => {
    if (await checkIsNative()) {
      if (!sourceId) throw new Error('A fonte desta obra não está identificada na biblioteca.');
      if (await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      const result = await handleNativeResponse(TachiyomiNative.getChapterList({ sourceId, mangaUrl: mangaId }));
      const chapters = result?.chapters || [];
      const library = getLocalLibrary();
      const index = library.findIndex((item: any) => String(item.id) === String(mangaId));
      if (index >= 0) {
        const existing = new Map<string, any>(
          (library[index].chapters || []).map((chapter: any) => [
            String(chapter.id || chapter.url || chapter.sourceChapterId),
            chapter,
          ])
        );
        const merged = chapters.map((chapter: any) => {
          const key = String(chapter.id || chapter.url || chapter.sourceChapterId);
          const previous = existing.get(key);
          return previous ? { ...chapter, ...previous, ...chapter } : chapter;
        });
        library[index] = { ...library[index], chapters: merged, lastCheckedAt: new Date().toISOString() };
        saveLocalLibrary(library);
      }
      return { success: true, chapters, total: chapters.length };
    }
    return request<any>(`/manga/${encodeURIComponent(mangaId)}/refresh`, { method: 'POST' });
  },
  setInLibrary: async (
    id: string,
    inLibrary: boolean,
    categoryId?: string,
    mangaData?: any,
  ) => {
    const isNative = await checkIsNative();
    if (!isNative) {
      try {
        return await request<any>(`/manga/${encodeURIComponent(id)}/library`, {
          method: 'POST',
          body: JSON.stringify({ inLibrary, categoryId }),
        });
      } catch {
        // O modo web sem backend também pode usar a biblioteca local.
      }
    }

    const lib = getLocalLibrary();
    const index = lib.findIndex((m: any) => String(m.id) === String(id));

    if (!inLibrary) {
      const next = lib.filter((m: any) => String(m.id) !== String(id));
      saveLocalLibrary(next);
      return { inLibrary: false, isFavorite: false };
    }

    let details = mangaData || (index >= 0 ? lib[index] : null);
    if (!details) {
      if (!isNative) {
        details = await getMangaDexDetails(id);
      } else {
        throw new Error(
          'Não foi possível salvar esta obra: os dados da fonte não foram enviados para a biblioteca.'
        );
      }
    }

    const record = {
      ...details,
      id,
      sourceId: details.sourceId || (id.includes('mangadex') ? 'mangadex' : undefined),
      sourceMangaId: details.sourceMangaId || details.url || id,
      chapters: Array.isArray(details.chapters) ? details.chapters : [],
      inLibrary: true,
      isFavorite: Boolean(details.isFavorite || categoryId === 'favorites'),
      categoryId: categoryId || details.categoryId || 'default',
      savedAt: details.savedAt || new Date().toISOString(),
    };

    if (index >= 0) lib[index] = { ...lib[index], ...record };
    else lib.unshift(record);
    saveLocalLibrary(lib);
    return { inLibrary: true, isFavorite: record.isFavorite };
  },
  toggleFavorite: async (id: string, isFavorite: boolean, mangaData?: any) => {
    const isNative = await checkIsNative();
    if (!isNative) {
      try {
        return await request<any>(`/manga/${encodeURIComponent(id)}/favorite`, {
          method: 'POST',
          body: JSON.stringify({ isFavorite }),
        });
      } catch {
        // Continua com persistência local se o backend web não estiver disponível.
      }
    }

    const lib = getLocalLibrary();
    const index = lib.findIndex((m: any) => String(m.id) === String(id));
    const existing = index >= 0 ? lib[index] : null;

    if (!isFavorite) {
      if (!existing) return { isFavorite: false, inLibrary: false };
      if (existing.wasInLibraryBeforeFavorite) {
        const updated = { ...existing, isFavorite: false, inLibrary: true, categoryId: 'default' };
        delete updated.wasInLibraryBeforeFavorite;
        lib[index] = updated;
      } else {
        lib.splice(index, 1);
      }
      saveLocalLibrary(lib);
      return { isFavorite: false, inLibrary: Boolean(existing.wasInLibraryBeforeFavorite) };
    }

    let details = mangaData || existing;
    if (!details) {
      if (!isNative) details = await getMangaDexDetails(id);
      else throw new Error('Não foi possível favoritar: os dados da obra não foram enviados.');
    }

    const wasInLibraryBeforeFavorite = existing
      ? (existing.isFavorite ? Boolean(existing.wasInLibraryBeforeFavorite) : Boolean(existing.inLibrary))
      : false;
    const record = {
      ...details,
      id,
      sourceMangaId: details.sourceMangaId || details.url || id,
      chapters: Array.isArray(details.chapters) ? details.chapters : [],
      inLibrary: true,
      isFavorite: true,
      categoryId: existing?.categoryId && existing.categoryId !== 'favorites' ? existing.categoryId : 'favorites',
      wasInLibraryBeforeFavorite,
      savedAt: details.savedAt || new Date().toISOString(),
    };
    if (index >= 0) lib[index] = { ...existing, ...record };
    else lib.unshift(record);
    saveLocalLibrary(lib);
    return { isFavorite: true, inLibrary: true };
  },
  setCategory: async (id: string, categoryId: string) => {
    if (await checkIsNative()) {
      const library = getLocalLibrary();
      const index = library.findIndex((item: any) => String(item.id) === String(id));
      if (index < 0) throw new Error('A obra não está na biblioteca local.');
      library[index] = { ...library[index], categoryId };
      saveLocalLibrary(library);
      return { success: true, categoryId };
    }
    return request<any>(`/manga/${encodeURIComponent(id)}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) });
  },

  // Chapters
  getPages: async (chapterId: string, sourceId?: string, mangaId?: string) => {
    if (!sourceId || sourceId === 'mangadex') {
      return getMangaDexPages(chapterId);
    }
    if (await checkIsNative()) {
      if (sourceId && await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      // Tenta offline primeiro
      if (mangaId) {
        try {
          const offline = await handleNativeResponse(TachiyomiNative.getOfflinePages({ sourceId, mangaId, chapterId }));
          if (offline?.pages?.length > 0) return offline;
        } catch {}
      }
      // Busca online via extensão nativa
      const nat = await handleNativeResponse(TachiyomiNative.getPageList({ sourceId, chapterUrl: chapterId }));
      if (nat?.pages?.length > 0) return nat;
      throw new Error(`Extensão "${sourceId}" não retornou páginas.`);
    }
    try {
      return await request<any>(`/chapters/${chapterId}/pages`);
    } catch {
      throw new Error(`Páginas não disponíveis. Fonte "${sourceId}" indisponível.`);
    }
  },
  updateProgress: async (chapterId: string, page: number, totalPages: number, isRead: boolean) => {
    if (await checkIsNative()) {
      const hist = getLocalHistory();
      const existing = hist.findIndex((h: any) => String(h.chapterId) === String(chapterId));
      const entry = { chapterId, page, totalPages, isRead, readAt: new Date().toISOString() };
      if (existing >= 0) hist[existing] = entry;
      else hist.unshift(entry);
      saveLocalHistory(hist.slice(0, 100));
      const library = getLocalLibrary().map((manga: any) => ({
        ...manga,
        chapters: (manga.chapters || []).map((chapter: any) =>
          String(chapter.id || chapter.url || chapter.sourceChapterId) === String(chapterId)
            ? { ...chapter, lastPageRead: page, isRead }
            : chapter
        ),
      }));
      saveLocalLibrary(library);
      return { success: true };
    }
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
  markChaptersRead: async (chapterIds: string[], isRead: boolean) => {
    if (await checkIsNative()) {
      const ids = new Set(chapterIds.map(String));
      const library = getLocalLibrary().map((manga: any) => ({
        ...manga,
        chapters: (manga.chapters || []).map((chapter: any) =>
          ids.has(String(chapter.id || chapter.url || chapter.sourceChapterId))
            ? { ...chapter, isRead }
            : chapter
        ),
      }));
      saveLocalLibrary(library);
      return { success: true, updated: chapterIds.length };
    }
    return request<any>('/chapters/mark-read', { method: 'POST', body: JSON.stringify({ chapterIds, isRead }) });
  },

  // Downloads
  getDownloads: async () => {
    if (await checkIsNative()) {
      const native = await TachiyomiNative.getDownloadedChapters();
      const library = getLocalLibrary();
      const key = (value: any) => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_');
      return (native.downloads || []).map((item: any) => {
        const manga = library.find((entry: any) =>
          key(entry.id || entry.sourceMangaId) === item.mangaId &&
          key(entry.sourceId || 'mangadex') === item.sourceId
        );
        const chapter = (manga?.chapters || []).find((entry: any) =>
          key(entry.id || entry.url || entry.sourceChapterId) === item.chapterId
        );
        return {
          id: `${item.sourceId}:${item.mangaId}:${item.chapterId}`,
          sourceId: item.sourceId,
          mangaId: item.mangaId,
          chapterId: item.chapterId,
          mangaTitle: manga?.title || item.mangaId,
          chapterTitle: chapter?.name || chapter?.title || item.chapterId,
          coverUrl: manga?.coverUrl || '',
          status: 'COMPLETED',
          progress: 100,
          downloadedPages: item.pages,
          totalPages: item.pages,
          totalBytes: item.totalBytes,
        };
      });
    }
    try {
      return await request<any[]>('/downloads');
    } catch {
      return [];
    }
  },
  getStorageUsage: async () => {
    if (await checkIsNative()) return TachiyomiNative.getStorageUsage();
    try {
      return await request<{ totalBytes: number; formatted: string }>('/downloads/storage');
    } catch {
      return { totalBytes: 0, formatted: '0 MB' };
    }
  },
  enqueueDownload: async (chapterId: string, sourceId?: string, mangaId?: string, _imageUrls?: string[]) => {
    if (await checkIsNative()) {
      if (!sourceId || !mangaId) {
        throw new Error('sourceId e mangaId são necessários para baixar capítulos no aparelho.');
      }
      if (await sourceNeedsConfiguration(sourceId)) {
        throw new Error(`[${sourceId}] Esta extensão requer configuração antes de usar. Acesse Configurações > Configuração de Extensões para configurar o servidor e autenticação.`);
      }
      const result = await handleNativeResponse(TachiyomiNative.downloadChapterFromSource({
        sourceId, mangaId, chapterId,
      }));
      if (!result?.success) throw new Error('O download não foi concluído.');
      return result;
    }
    return request<any>('/downloads/enqueue', { method: 'POST', body: JSON.stringify({ chapterId }) });
  },
  enqueueBatch: async (chapterIds: string[], sourceId?: string, mangaId?: string) => {
    if (await checkIsNative()) {
      let count = 0;
      const errors: string[] = [];
      for (const chapterId of chapterIds) {
        try {
          await api.enqueueDownload(chapterId, sourceId, mangaId);
          count++;
        } catch (error: any) {
          errors.push(`${chapterId}: ${error?.message || error}`);
        }
      }
      return { success: errors.length === 0, enqueuedCount: count, errors };
    }
    return request<any>('/downloads/enqueue-batch', { method: 'POST', body: JSON.stringify({ chapterIds }) });
  },
  cancelDownload: async (chapterId: string, deleteFiles = false) => {
    if (await checkIsNative()) {
      if (!deleteFiles) return { success: false, message: 'Não há fila de downloads em segundo plano no modo Android local.' };
      return TachiyomiNative.deleteOfflineChapter({ chapterId });
    }
    return request<any>(`/downloads/${encodeURIComponent(chapterId)}?deleteFiles=${deleteFiles}`, { method: 'DELETE' });
  },
  pauseDownloads: async () => {
    if (await checkIsNative()) return { success: true, paused: false, message: 'Downloads locais são executados diretamente pelo aparelho.' };
    return request<any>('/downloads/pause', { method: 'POST' });
  },
  resumeDownloads: async () => {
    if (await checkIsNative()) return { success: true, resumed: true };
    return request<any>('/downloads/resume', { method: 'POST' });
  },
  clearCompleted: async () => {
    if (await checkIsNative()) return TachiyomiNative.deleteAllOfflineDownloads();
    return request<any>('/downloads/clear-completed', { method: 'POST' });
  },
  scanLocal: async () => {
    if (await checkIsNative()) {
      const result = await TachiyomiNative.getDownloadedChapters();
      return { importedCount: result.downloads?.length || 0 };
    }
    return request<any>('/downloads/scan-local', { method: 'POST' });
  },

  // Library
  getLibrary: async (category?: string, search?: string) => {
    if (await checkIsNative()) {
      let lib = getLocalLibrary();
      if (category && category !== 'all') lib = lib.filter((m: any) => m.categoryId === category);
      if (search) lib = lib.filter((m: any) => m.title?.toLowerCase().includes(search.toLowerCase()));
      return lib;
    }
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.append('category', category);
      if (search) params.append('search', search);
      const qs = params.toString();
      return await request<any[]>(`/library${qs ? `?${qs}` : ''}`);
    } catch {
      let lib = getLocalLibrary();
      if (category && category !== 'all') {
        lib = lib.filter((m: any) => m.categoryId === category);
      }
      if (search) {
        lib = lib.filter((m: any) => m.title?.toLowerCase().includes(search.toLowerCase()));
      }
      return lib;
    }
  },
  getCategories: async () => {
    if (await checkIsNative()) return getLocalCategories();
    try {
      return await request<any[]>('/library/categories');
    } catch {
      return getLocalCategories();
    }
  },
  createCategory: async (name: string) => {
    if (await checkIsNative()) {
      const categories = getLocalCategories();
      const category = { id: `category_${Date.now()}`, name };
      categories.push(category);
      saveLocalCategories(categories);
      return category;
    }
    return request<any>('/library/categories', { method: 'POST', body: JSON.stringify({ name }) });
  },
  deleteCategory: async (id: string) => {
    if (await checkIsNative()) {
      const categories = getLocalCategories().filter((category: any) => category.id !== id);
      saveLocalCategories(categories);
      const library = getLocalLibrary().map((manga: any) =>
        manga.categoryId === id ? { ...manga, categoryId: 'default' } : manga
      );
      saveLocalLibrary(library);
      return { success: true };
    }
    return request<any>(`/library/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // History
  getHistory: async (limit = 50) => {
    if (await checkIsNative()) return getLocalHistory().slice(0, limit);
    try {
      return await request<any[]>(`/history?limit=${limit}`);
    } catch {
      return getLocalHistory().slice(0, limit);
    }
  },
  clearHistory: async () => {
    if (await checkIsNative()) {
      saveLocalHistory([]);
      return { success: true };
    }
    try {
      return await request<any>('/history', { method: 'DELETE' });
    } catch {
      saveLocalHistory([]);
      return { success: true };
    }
  },

  // Settings
  getSettings: async () => {
    const defaults = {
      downloadPath: 'OmniYomi/Downloads',
      concurrentDownloads: 2,
      autoDownloadNew: false,
      defaultReaderMode: 'vertical_webtoon',
      readerMode: 'vertical_webtoon',
      fitMode: 'fit_width',
      pageSpacing: 4,
      autoMarkReadPercent: 80,
      port: 4567,
      flaresolverrUrl: '',
    };
    if (await checkIsNative()) {
      try {
        return { ...defaults, ...JSON.parse(localStorage.getItem('omniyomi_settings') || '{}') };
      } catch {
        return defaults;
      }
    }
    try {
      return await request<any>('/settings');
    } catch {
      try {
        return { ...defaults, ...JSON.parse(localStorage.getItem('omniyomi_settings') || '{}') };
      } catch {
        return defaults;
      }
    }
  },
  updateSettings: async (settings: any) => {
    if (await checkIsNative()) {
      localStorage.setItem('omniyomi_settings', JSON.stringify(settings));
      return settings;
    }
    try {
      return await request<any>('/settings', { method: 'PUT', body: JSON.stringify(settings) });
    } catch {
      localStorage.setItem('omniyomi_settings', JSON.stringify(settings));
      return settings;
    }
  },

  // Updates
  checkUpdates: async () => {
    // Verifica atualizações localmente — sem servidor
    const lib = getLocalLibrary();
    const isNative = await checkIsNative();
    const results: any[] = [];
    const errors: any[] = [];

    for (const manga of lib) {
      const srcId = manga.sourceId;
      if (!srcId) continue;

      try {
        let newChapters: any[] = [];

        if (srcId === 'mangadex') {
          const fetched = await getMangaDexChapters(manga.id);
          newChapters = fetched || [];
        } else if (isNative) {
          const res = await TachiyomiNative.getChapterList({ sourceId: srcId, mangaUrl: manga.id });
          newChapters = res.chapters || [];
        } else {
          // Sem servidor e sem nativo: pula
          continue;
        }

        const storedIds = new Set((manga.chapters || []).map((c: any) => String(c.id || c.url || c.sourceChapterId)));
        const fresh = newChapters.filter((c: any) => !storedIds.has(String(c.id || c.url || c.sourceChapterId)));

        if (fresh.length > 0) {
          // Atualiza biblioteca local com novos capítulos
          const updated = { ...manga, chapters: [...(manga.chapters || []), ...fresh] };
          results.push({
            mangaId: manga.id,
            title: manga.title,
            newChaptersCount: fresh.length,
            newChapters: fresh,
          });
          // Persiste atualização na biblioteca local
          const currentLib = getLocalLibrary();
          const idx = currentLib.findIndex((m: any) => m.id === manga.id);
          if (idx >= 0) {
            currentLib[idx] = updated;
            saveLocalLibrary(currentLib);
          }
        }
      } catch (e: any) {
        errors.push({ mangaId: manga.id, title: manga.title, error: e.message });
      }
    }

    return {
      updatedManga: results,
      errors,
      checkedAt: new Date().toISOString(),
      totalChecked: lib.length,
      totalUpdated: results.length,
      message: results.length > 0
        ? `${results.length} obra(s) com novos capítulos!`
        : 'Sua biblioteca está atualizada.',
    };
  },

  checkExtensionUpdates: async () => {
    const installed = getLocalInstalledSources();
    const repos = getLocalRepositories().filter((r: any) => r.enabled);
    const updates: any[] = [];

    await Promise.allSettled(repos.map(async (repo: any) => {
      try {
        const url = normalizeRepoUrl(repo.url);
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const exts = await parseExtensionRepositoryResponse(url, res);

        for (const ext of exts) {
          const pkg = ext.packageName || ext.pkg || '';
          const local = installed.find((source: any) => source.pkg === pkg);
          if (!local) continue;

          const remoteCode = String(ext.versionCode || '');
          const localCode = String(local.versionCode || '');
          const remoteVersion = String(ext.versionName || ext.version || '');
          const hasNewerCode = remoteCode && localCode
            ? BigInt(remoteCode) > BigInt(localCode)
            : Boolean(remoteVersion && remoteVersion !== String(local.version || ''));

          if (hasNewerCode) {
            updates.push({
              pkg,
              name: ext.name || local.name,
              currentVersion: local.version,
              newVersion: remoteVersion || 'Atualização disponível',
              currentVersionCode: localCode,
              newVersionCode: remoteCode,
              extensionLib: ext.extensionLib || '',
              apkUrl: ext.resources?.apkUrl || (ext.apk ? `${url.substring(0, url.lastIndexOf('/'))}/apk/${ext.apk}` : ''),
              repoName: repo.name,
            });
          }
        }
      } catch (error: any) {
        console.warn(`[Atualização de extensões] Falha ao consultar ${repo.name}:`, error?.message || error);
      }
    }));

    return { updates, totalUpdates: updates.length };
  },

  checkAppUpdate: async () => {
    try {
      const res = await fetch('https://api.github.com/repos/AlefLorenzo/OmniYomi/releases/latest', {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      if (!res.ok) throw new Error(`GitHub API erro ${res.status}`);
      const data = await res.json();
      const latestTag = data.tag_name || '';
      const latestVersion = latestTag.replace(/^v/, '');
      const apkAsset = (data.assets || []).find((a: any) => a.name?.endsWith('.apk'));
      return {
        latestVersion,
        releaseUrl: data.html_url || '',
        apkUrl: apkAsset?.browser_download_url || '',
        releaseNotes: data.body || '',
        publishedAt: data.published_at || '',
      };
    } catch (e: any) {
      throw new Error(`Falha ao verificar atualizações do app: ${e.message}`);
    }
  },
};
