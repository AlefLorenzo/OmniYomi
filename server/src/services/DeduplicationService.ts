import { Manga } from '../types/index.js';
import { cleanTitleString } from './TitleNormalizer.js';

export interface DeduplicatedMangaGroup {
  canonicalSlug: string;
  preferredTitle: string;
  originalTitle?: string;
  author?: string;
  coverUrl: string;
  sources: Array<{
    sourceId: string;
    sourceName?: string;
    mangaId: string;
    title: string;
    totalChapters: number;
    inLibrary: boolean;
  }>;
}

/**
 * Normaliza uma string de título para cálculo determinístico de similaridade/slug canônico
 */
export function generateCanonicalSlug(title: string, author?: string): string {
  const clean = cleanTitleString(title).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')                      // apenas caracteres alfanuméricos
    .replace(/^-+|-+$/g, '');

  if (author && author !== 'Unknown' && author !== 'Desconhecido') {
    const cleanAuthor = author.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${clean}__${cleanAuthor}`;
  }

  return clean;
}

export class DeduplicationService {
  private static instance: DeduplicationService;

  public static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService();
    }
    return DeduplicationService.instance;
  }

  /**
   * Agrupa uma lista de obras preservando suas identidades individuais de cada fonte
   */
  public groupMangaAcrossSources(mangaList: Manga[]): DeduplicatedMangaGroup[] {
    const groups = new Map<string, DeduplicatedMangaGroup>();

    for (const m of mangaList) {
      const slug = generateCanonicalSlug(m.title);

      if (!groups.has(slug)) {
        groups.set(slug, {
          canonicalSlug: slug,
          preferredTitle: m.title,
          originalTitle: (m as any).originalTitle,
          author: m.author,
          coverUrl: m.coverUrl,
          sources: [],
        });
      }

      const grp = groups.get(slug)!;
      // Adicionar à lista de fontes se ainda não estiver presente
      if (!grp.sources.some(s => s.mangaId === m.id)) {
        grp.sources.push({
          sourceId: m.sourceId,
          sourceName: (m as any).sourceName || m.sourceId,
          mangaId: m.id,
          title: m.title,
          totalChapters: m.totalChapters || 0,
          inLibrary: m.inLibrary || false,
        });
      }
    }

    return Array.from(groups.values());
  }

  /**
   * Identifica se duas obras de fontes diferentes representam a mesma obra
   */
  public isSameWork(m1: Manga, m2: Manga): boolean {
    if (m1.id === m2.id) return true;

    const slug1 = generateCanonicalSlug(m1.title);
    const slug2 = generateCanonicalSlug(m2.title);

    if (slug1 === slug2) {
      // Se títulos são idênticos normalizados, conferir autor se presente
      if (m1.author && m2.author && m1.author !== 'Desconhecido' && m2.author !== 'Desconhecido') {
        const auth1 = m1.author.toLowerCase().trim();
        const auth2 = m2.author.toLowerCase().trim();
        return auth1.includes(auth2) || auth2.includes(auth1);
      }
      return true;
    }

    // Conferir títulos alternativos
    const m1Alts = (m1.altTitles || []).map(t => generateCanonicalSlug(t));
    const m2Alts = (m2.altTitles || []).map(t => generateCanonicalSlug(t));

    const matchAlt = m1Alts.some(a => a === slug2 || m2Alts.includes(a));
    return matchAlt;
  }
}

export const deduplicationService = DeduplicationService.getInstance();
