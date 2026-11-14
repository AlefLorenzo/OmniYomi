/**
 * TitleNormalizer.ts
 *
 * Sistema rigoroso de identificação, priorização e normalização de títulos.
 * REGRA FUNDAMENTAL:
 * - O título principal DEVE estar em Português (PT-BR) ou Inglês (EN) com alfabeto latino.
 * - NUNCA exibir títulos em japonês (kanji/hiragana/katakana), coreano (hangul),
 *   chinês (hanzi), árabe ou outros alfabetos não latinos como título principal.
 * - Preservar título original no campo `originalTitle`.
 * - Preservar grafia oficial e nomes próprios sem inventar traduções.
 */

// Scripts não latinos proibidos no título principal
const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/; // Japonês e Chinês
const HANGUL_REGEX = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/; // Coreano
const ARABIC_REGEX = /[\u0600-\u06ff\u0750-\u077f]/; // Árabe
const CYRILLIC_REGEX = /[\u0400-\u04ff]/; // Cirílico

export interface NormalizedTitles {
  title: string;              // Título principal obrigatório em PT-BR ou EN
  originalTitle?: string;     // Título original (pode estar em japonês, coreano, etc.)
  altTitles: string[];        // Títulos alternativos limpos e deduplicados
  langDetected?: 'pt-br' | 'en' | 'other';
}

/**
 * Verifica se um texto possui caracteres de alfabetos não latinos proibidos para o título principal.
 */
export function isNonLatinScript(text: string): boolean {
  if (!text) return false;
  return CJK_REGEX.test(text) || HANGUL_REGEX.test(text) || ARABIC_REGEX.test(text);
}

/**
 * Remove sufixos e ruídos comuns de sites de scanlation
 */
export function cleanTitleString(title: string): string {
  if (!title) return '';
  return title
    .replace(/^Thumbnail for\s+/i, '')
    .replace(/\s*\[(?:Official|Webtoon|PT-BR|EN|Scan|Color|Colored|PT)\]\s*/gi, '')
    .replace(/\s*\((?:Official|Webtoon|PT-BR|EN|Scan|Color|Colored|PT)\)\s*/gi, '')
    .replace(/\s*-\s*Raw\s*$/i, '')
    .replace(/\s*-\s*Webtoon\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Normaliza títulos de uma obra respeitando a ordem de prioridade:
 * 1. Título oficial em PT-BR (se já fornecido ou identificado).
 * 2. Título oficial em inglês (EN).
 * 3. Título alternativo em inglês (EN).
 * 4. Título alternativo em caracteres latinos / tradução confiável.
 * 5. Se o título bruto for CJK/Hangul e houver um título alternativo latino, inverte:
 *    o latino vira `title` e o CJK vira `originalTitle`.
 */
export function normalizeMangaTitles(
  rawTitle: string,
  rawAltTitles: string[] = [],
  preferredLang: string = 'pt-br'
): NormalizedTitles {
  const cleanedMain = cleanTitleString(rawTitle);
  const cleanedAlts = (rawAltTitles || [])
    .map(cleanTitleString)
    .filter(t => t.length > 0);

  let originalTitle: string | undefined = undefined;
  let chosenMainTitle = '';
  const remainingAlts: string[] = [];

  const mainIsNonLatin = isNonLatinScript(cleanedMain);

  if (mainIsNonLatin) {
    // O título principal bruto está em CJK/Hangul/Árabe: DEVE ser movido para originalTitle
    originalTitle = cleanedMain;

    // Procurar nas alternativas um título em alfabeto latino
    const latinAlts = cleanedAlts.filter(t => !isNonLatinScript(t));
    if (latinAlts.length > 0) {
      // Priorizar o primeiro título latino confiável
      chosenMainTitle = latinAlts[0];
      // Adicionar outros títulos às alternativas
      cleanedAlts.forEach(t => {
        if (t !== chosenMainTitle && !remainingAlts.includes(t)) {
          remainingAlts.push(t);
        }
      });
    } else {
      // Se não houver nenhum título latino nas alternativas, marcar para validação
      chosenMainTitle = cleanedMain;
    }
  } else {
    // Título principal já está em caracteres latinos (PT-BR ou EN)
    chosenMainTitle = cleanedMain;

    // Verificar se nas alternativas existe o título original em alfabeto não-latino
    const nonLatinAlt = cleanedAlts.find(t => isNonLatinScript(t));
    if (nonLatinAlt) {
      originalTitle = nonLatinAlt;
    }

    // Filtrar alternativas restantes sem duplicar o principal
    cleanedAlts.forEach(t => {
      if (t.toLowerCase() !== chosenMainTitle.toLowerCase() && !remainingAlts.includes(t)) {
        remainingAlts.push(t);
      }
    });
  }

  // Detectar idioma aproximado (pt-br ou en)
  let langDetected: 'pt-br' | 'en' | 'other' = 'en';
  const ptWords = /\b(o|a|os|as|um|uma|de|do|da|dos|das|em|no|na|para|com|por|não|que|meu|minha|seu|sua|eu|você|ele|ela|vida|rei|morte|nível|mundo|sobrenatural)\b/i;
  if (ptWords.test(chosenMainTitle)) {
    langDetected = 'pt-br';
  } else if (!isNonLatinScript(chosenMainTitle)) {
    langDetected = 'en';
  } else {
    langDetected = 'other';
  }

  return {
    title: chosenMainTitle,
    originalTitle,
    altTitles: remainingAlts,
    langDetected,
  };
}

/**
 * Validador estrito de conformidade com a Regra 1
 */
export function validateTitleLanguage(title: string): { valid: boolean; reason?: string } {
  if (!title || !title.trim()) {
    return { valid: false, reason: 'Título vazio ou ausente.' };
  }

  if (isNonLatinScript(title)) {
    return {
      valid: false,
      reason: 'O título principal contém caracteres em alfabeto não-latino (CJK, Hangul ou Árabe). Deve ser exibido em PT-BR ou EN.',
    };
  }

  return { valid: true };
}
