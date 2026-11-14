import { db } from '../db/database.js';

export interface ParsedMangaId {
  sourceId: string;
  sourceMangaId: string;
}

export interface ParsedChapterId {
  sourceId: string;
  mangaId: string;
  sourceChapterId: string;
}

/**
 * Safely parses any manga ID into sourceId and sourceMangaId.
 * Supports:
 * - APK sources: "apk:eu.kanade.tachiyomi.extension.pt.imperiodabritannia:7355004027880350247:solo-leveling"
 * - Standard sources: "mangadex:32d76d19-8a05-4db0-9fc2-e0b0648fe9d0"
 * - Local sources: "local:my-local-manga"
 */
export function parseMangaId(mangaId: string): ParsedMangaId {
  if (!mangaId) {
    return { sourceId: '', sourceMangaId: '' };
  }

  // APK source format: apk:{pkg}:{numericSourceId}:{mangaSlug...}
  if (mangaId.startsWith('apk:')) {
    const parts = mangaId.split(':');
    if (parts.length >= 3) {
      const sourceId = `${parts[0]}:${parts[1]}:${parts[2]}`;
      const sourceMangaId = parts.slice(3).join(':');
      return { sourceId, sourceMangaId };
    }
  }

  // Standard format: {sourceId}:{sourceMangaId}
  const colonIdx = mangaId.indexOf(':');
  if (colonIdx !== -1) {
    return {
      sourceId: mangaId.substring(0, colonIdx),
      sourceMangaId: mangaId.substring(colonIdx + 1),
    };
  }

  return { sourceId: mangaId, sourceMangaId: mangaId };
}

/**
 * Safely parses any chapter ID into sourceId, mangaId, and sourceChapterId.
 * Checks local database first for speed and accuracy.
 */
export function parseChapterId(chapterId: string): ParsedChapterId {
  if (!chapterId) {
    return { sourceId: '', mangaId: '', sourceChapterId: '' };
  }

  // 1. Try DB lookup first
  const dbChapter = db.getChapterById(chapterId);
  if (dbChapter) {
    return {
      sourceId: dbChapter.sourceId,
      mangaId: dbChapter.mangaId,
      sourceChapterId: dbChapter.sourceChapterId,
    };
  }

  // 2. APK chapter format: apk:{pkg}:{numericSourceId}:{mangaSlug}:{chapterSlug}
  if (chapterId.startsWith('apk:')) {
    const parts = chapterId.split(':');
    if (parts.length >= 4) {
      const sourceId = `${parts[0]}:${parts[1]}:${parts[2]}`;
      const sourceChapterId = parts[parts.length - 1];
      const mangaId = parts.slice(0, parts.length - 1).join(':');
      return { sourceId, mangaId, sourceChapterId };
    }
  }

  // 3. Standard format: {sourceId}:{mangaSlug}:{chapterSlug}
  const parts = chapterId.split(':');
  if (parts.length >= 3) {
    const sourceId = parts[0];
    const sourceChapterId = parts.slice(2).join(':');
    const mangaId = `${parts[0]}:${parts[1]}`;
    return { sourceId, mangaId, sourceChapterId };
  }

  return {
    sourceId: parts[0] || '',
    mangaId: parts.slice(0, 2).join(':'),
    sourceChapterId: parts[parts.length - 1] || '',
  };
}
