/**
 * TitleNormalizer.ts
 *
 * Sistema rigoroso de identificação de idioma, priorização e normalização de títulos.
 * REGRA FUNDAMENTAL:
 * - O título principal DEVE estar em Português (PT-BR) ou Inglês (EN).
 * - NUNCA exibir títulos em japonês, coreano, chinês ou outros idiomas não latinos.
 * - NUNCA exibir romanizações não traduzidas (Romaji, Romaja, Pinyin como "Na Honjaman Level-Up",
 *   "Ore Dake Level Up na Ken", "Shingeki no Kyojin") quando existir título oficial em inglês/PT-BR.
 * - Preservar o título original no campo `originalTitle`.
 * - Identificar o idioma do título (`titleLang`: 'pt-br' | 'en').
 * - Preservar títulos alternativos no campo `altTitles`.
 * - Registrar a fonte do metadado (`metadataSource`).
 */

// Scripts não latinos proibidos no título principal
const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/; // Japonês e Chinês
const HANGUL_REGEX = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/; // Coreano
const ARABIC_REGEX = /[\u0600-\u06ff\u0750-\u077f]/; // Árabe
const CYRILLIC_REGEX = /[\u0400-\u04ff]/; // Cirílico

// Padrões de romanização comuns que NÃO são inglês nem português
const ROMAJI_PATTERNS = [
  /\b(?:no|wa|wo|ni|de|kara|desu|nai|tara|koto|mono|sekai|maou|isekai|tensei|monogatari|yuusha|mahou|shingeki|kyojin|kimetsu|yaiba|jujutsu|kaisen|bisque|suru|boku|tsunagari|kanojo|sensei|senpai|tensei|douwa|shoujo|shounen)\b/i,
  /-(?:san|kun|chan|sama|sensei|senpai)\b/i,
];

const ROMAJA_PATTERNS = [
  /\b(?:honjaman|lebel-eob|lebeleob|sonyeo|hwangje|yeongju|gisa|ap-eseo|dwieseo|chong|geomeun|namja|yeoja|eob|dwaet|dwaeyo|isseo|eobseo)\b/i,
];

const PINYIN_PATTERNS = [
  /\b(?:xiao|zhi|zai|tian|shen|wang|huang|douluo|dalu|wuxia|xianxia|xiuzhen)\b/i,
];

// Títulos oficiais licenciados e comercializados no Ocidente com esta grafia padrão
const GLOBALLY_OFFICIAL_TITLES = new Set([
  'jujutsu kaisen',
  'tokyo revengers',
  'chainsaw man',
  'spy x family',
  'one piece',
  'dragon ball',
  'bleach',
  'naruto',
  'boruto',
  'gintama',
  'inuyasha',
  'death note',
  'fullmetal alchemist',
  'hunter x hunter',
  'fairy tail',
  'black clover',
  'demon slayer',
  'my hero academia',
  'attack on titan',
  'solo leveling',
  'blue lock',
  'haikyuu',
  'haikyu!!',
  'berserk',
  'vagabond',
  'vinland saga',
  'monster',
  'slam dunk',
  'akira',
  'yu yu hakusho',
  'shaman king',
  'sailor moon',
  'evangelion',
  'cowboy bebop',
  'doraemon',
  'detective conan',
  'case closed',
  'hajime no ippo',
  'hajime no ippo: the fighting!',
  'hajime no ippo: fighting spirit!',
  'hajime no ippo: fighting spirit',
  'oshi no ko',
  'dandadan',
  'kagurabachi',
  'sakamoto days',
  'gachiakuta',
  'gokurakugai',
  'blue box',
  'wind breaker',
]);

export interface NormalizedTitles {
  title: string;              // Título principal obrigatório em PT-BR ou EN
  titleLang: 'pt-br' | 'en' | 'unknown'; // Idioma identificado
  originalTitle?: string;     // Título original (em japonês, coreano, romaji, etc.)
  altTitles: string[];        // Títulos alternativos limpos e deduplicados
  metadataSource?: string;    // Fonte do metadado
}

/**
 * Verifica se um texto possui caracteres de alfabetos não latinos
 */
export function isNonLatinScript(text: string): boolean {
  if (!text) return false;
  return CJK_REGEX.test(text) || HANGUL_REGEX.test(text) || ARABIC_REGEX.test(text) || CYRILLIC_REGEX.test(text);
}

/**
 * Detecta se uma string em alfabeto latino é na verdade uma romanização (Romaji, Romaja, Pinyin)
 */
export function isRomanizedTitle(text: string): boolean {
  if (!text) return false;
  const clean = text.trim();

  // Títulos oficialmente licenciados no Ocidente com esta grafia padrão são permitidos
  if (GLOBALLY_OFFICIAL_TITLES.has(clean.toLowerCase())) {
    return false;
  }

  // Testar padrões de Romaja coreana (ex: "honjaman", "lebel-eob")
  for (const pat of ROMAJA_PATTERNS) {
    if (pat.test(clean)) return true;
  }

  // Testar padrões de Pinyin chinês
  for (const pat of PINYIN_PATTERNS) {
    if (pat.test(clean)) return true;
  }

  // Se o título contiver palavras estruturais comuns de inglês, é um título traduzido
  if (/\b(?:welcome|school|demon|love|level|reincarnated|slime|dungeon|after|before|death|hero|princess|king|knight|story|world|dark|black|white|sword|god|fighting|spirit|game|life|teasing|master|miss)\b/i.test(clean)) {
    return false;
  }

  // Testar padrões de Romaji japonesa
  for (const pat of ROMAJI_PATTERNS) {
    if (pat.test(clean)) return true;
  }

  // Partículas japonesas isoladas como " no ", " wa ", " wo "
  if (/\b(?:no|wa|wo)\b/i.test(clean) && !/\b(?:the|of|in|and|to|for|with)\b/i.test(clean)) {
    return true;
  }

  // Testar padrões de Pinyin chinês
  for (const pat of PINYIN_PATTERNS) {
    if (pat.test(clean)) return true;
  }

  return false;
}

/**
 * Remove ruídos e tags comuns de scanlation
 */
// Correções canônicas de grafias oficiais no Ocidente (ex: variações com caracteres decorativos como 卍)
const CANONICAL_TITLE_REPLACEMENTS: Record<string, string> = {
  'toukyou revengers': 'Tokyo Revengers',
  'toukyou 卍 revengers': 'Tokyo Revengers',
  'tokyo 卍 revengers': 'Tokyo Revengers',
  'shingeki no kyojin': 'Attack on Titan',
  'kimetsu no yaiba': 'Demon Slayer: Kimetsu no Yaiba',
  'boku no hero academia': 'My Hero Academia',
  'sono bisque doll wa koi o suru': 'My Dress-Up Darling',
  'na honjaman level-up': 'Solo Leveling',
  'na honjaman level up': 'Solo Leveling',
  'mairimashita! iruma-kun': 'Welcome to Demon School! Iruma-kun',
  'mairimashita iruma-kun': 'Welcome to Demon School! Iruma-kun',
  'sousou no frieren': "Frieren: Beyond Journey's End",
  'kusuriya no hitorigoto': 'The Apothecary Diaries',
  'mushoku tensei: isekai ittara honki dasu': 'Mushoku Tensei: Jobless Reincarnation',
  'mushoku tensei': 'Mushoku Tensei: Jobless Reincarnation',
  'tensei shitara slime datta ken': 'That Time I Got Reincarnated as a Slime',
  'dungeon meshi': 'Delicious in Dungeon',
  'kaijuu 8-gou': 'Kaiju No. 8',
  'kaguya-sama wa kokurasetai: tensai-tachi no renai zunousen': 'Kaguya-sama: Love Is War',
  'kaguya-sama wa kokurasetai': 'Kaguya-sama: Love Is War',
  'ijiranaide, nagatoro-san': "Don't Toy With Me, Miss Nagatoro",
  'mato seihei no slave': 'Chained Soldier',
  'kage no jitsuryokusha ni naritakute!': 'The Eminence in Shadow',
  'kage no jitsuryokusha': 'The Eminence in Shadow',
  'yofukashi no uta': 'Call of the Night',
  'kanojo, okarishimasu': 'Rent-a-Girlfriend',
  'gotoubun no hanayome': 'The Quintessential Quintuplets',
  'boku no kokoro no yabai yatsu': 'The Dangers in My Heart',
};

export function cleanTitleString(title: string): string {
  if (!title) return '';
  return title
    .replace(/^Thumbnail for\s+/i, '')
    .replace(/\s*\[(?:Official|Webtoon|PT-BR|EN|Scan|Color|Colored|PT)\]\s*/gi, '')
    .replace(/\s*\((?:Official|Webtoon|PT-BR|EN|Scan|Color|Colored|PT)\)\s*/gi, '')
    .replace(/\s*-\s*Raw\s*$/i, '')
    .replace(/\s*-\s*Webtoon\s*$/i, '')
    .replace(/[卍卐★☆♥♡♪]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Detecta se o texto está genuinamente em português
 */
export function isPortuguese(text: string): boolean {
  if (!text || isNonLatinScript(text) || isRomanizedTitle(text)) return false;
  // Palavras exclusivas de português com pelo menos 3 caracteres
  const ptSpecific = /\b(uma|dos|das|para|com|por|não|que|meu|minha|seu|sua|você|ele|ela|vida|morte|nível|mundo|sobrenatural|diário|boticária|caçador|mago|feiticeiro|espada|namorada|princesa|imperador|vilão|vilã|começo|depois|sozinho)\b/i;
  return ptSpecific.test(text);
}

/**
 * Detecta se o texto é inglês válido
 */
export function isEnglish(text: string): boolean {
  if (!text || isNonLatinScript(text) || isRomanizedTitle(text)) return false;
  return true;
}

/**
 * Normaliza e valida títulos de acordo com as regras obrigatórias:
 * 1. Título oficial em PT-BR
 * 2. Título oficial em Inglês
 * 3. Título alternativo em Inglês
 * 4. Tradução PT-BR confiável
 */
export function normalizeMangaTitles(
  rawTitle: string,
  rawAltTitles: Array<string | { [lang: string]: string }> = [],
  preferredLang: string = 'pt-br',
  metadataSource: string = 'Extensão'
): NormalizedTitles {
  const flattenedAlts: Array<{ lang?: string; text: string }> = [];

  for (const item of rawAltTitles || []) {
    if (typeof item === 'string') {
      const cleaned = cleanTitleString(item);
      if (cleaned) flattenedAlts.push({ text: cleaned });
    } else if (item && typeof item === 'object') {
      for (const [l, val] of Object.entries(item)) {
        const cleaned = cleanTitleString(val);
        if (cleaned) flattenedAlts.push({ lang: l.toLowerCase(), text: cleaned });
      }
    }
  }

  let cleanedRaw = cleanTitleString(rawTitle);
  let chosenMainTitle = '';
  let titleLang: 'pt-br' | 'en' | 'unknown' = 'unknown';
  let originalTitle: string | undefined = undefined;

  const canonKey = cleanedRaw.toLowerCase();
  if (CANONICAL_TITLE_REPLACEMENTS[canonKey]) {
    originalTitle = rawTitle;
    cleanedRaw = CANONICAL_TITLE_REPLACEMENTS[canonKey];
  }

  const rawIsInvalid = isNonLatinScript(cleanedRaw) || isRomanizedTitle(cleanedRaw);

  // 1. Procurar nas alternativas por PT-BR genuíno
  const ptAlt = flattenedAlts.find(a => (a.lang === 'pt-br' || a.lang === 'pt') && !isNonLatinScript(a.text) && !isRomanizedTitle(a.text));
  if (ptAlt) {
    chosenMainTitle = ptAlt.text;
    titleLang = 'pt-br';
  }

  // 2. Se o título bruto for PT-BR genuíno e não for romanização
  if (!chosenMainTitle && !rawIsInvalid && isPortuguese(cleanedRaw)) {
    chosenMainTitle = cleanedRaw;
    titleLang = 'pt-br';
  }

  // 3. Procurar nas alternativas por Inglês explícito (tag "en") que NÃO seja romanizado
  if (!chosenMainTitle) {
    const enAlts = flattenedAlts.filter(a => a.lang === 'en' && !isNonLatinScript(a.text) && !isRomanizedTitle(a.text));
    if (enAlts.length > 0) {
      chosenMainTitle = enAlts[0].text;
      titleLang = 'en';
    }
  }

  // 4. Se o título bruto for Inglês válido (não CJK e não Romanização)
  if (!chosenMainTitle && !rawIsInvalid) {
    chosenMainTitle = cleanedRaw;
    titleLang = 'en';
  }

  // 5. Se o título bruto for inválido (CJK ou Romanização como "Na Honjaman Level-Up"),
  // procurar nas alternativas qualquer título latino que NÃO seja romanizado
  if (!chosenMainTitle) {
    const anyValidLatin = flattenedAlts.find(a => !isNonLatinScript(a.text) && !isRomanizedTitle(a.text));
    if (anyValidLatin) {
      chosenMainTitle = anyValidLatin.text;
      titleLang = isPortuguese(chosenMainTitle) ? 'pt-br' : 'en';
      originalTitle = cleanedRaw; // O título bruto vira o originalTitle
    }
  }

  // 6. Caso extremo de obra sem nenhum título ocidental traduzido
  if (!chosenMainTitle) {
    const anyLatin = flattenedAlts.find(a => !isNonLatinScript(a.text));
    if (anyLatin) {
      chosenMainTitle = anyLatin.text;
      titleLang = 'unknown';
      originalTitle = cleanedRaw;
    } else {
      chosenMainTitle = cleanedRaw;
      titleLang = 'unknown';
      originalTitle = cleanedRaw;
    }
  }

  // Identificar originalTitle se ainda não setado
  if (!originalTitle) {
    if (rawIsInvalid) {
      originalTitle = cleanedRaw;
    } else {
      const nonLatin = flattenedAlts.find(a => isNonLatinScript(a.text));
      if (nonLatin) originalTitle = nonLatin.text;
    }
  }

  // Deduplicar títulos alternativos finais
  const remainingAlts: string[] = [];
  for (const alt of flattenedAlts) {
    if (
      alt.text.toLowerCase() !== chosenMainTitle.toLowerCase() &&
      alt.text !== originalTitle &&
      !remainingAlts.includes(alt.text)
    ) {
      remainingAlts.push(alt.text);
    }
  }

  return {
    title: chosenMainTitle,
    titleLang,
    originalTitle,
    altTitles: remainingAlts.slice(0, 8),
    metadataSource,
  };
}

/**
 * Validador estrito de conformidade com a Regra de Idioma
 */
export function validateTitleLanguage(title: string): { valid: boolean; detectedLang: string; reason?: string } {
  if (!title || !title.trim()) {
    return { valid: false, detectedLang: 'empty', reason: 'Título vazio ou ausente.' };
  }

  if (isNonLatinScript(title)) {
    return {
      valid: false,
      detectedLang: 'cjk_or_non_latin',
      reason: 'O título principal contém caracteres em alfabeto não-latino (CJK, Hangul, Cirílico ou Árabe).',
    };
  }

  if (isRomanizedTitle(title)) {
    return {
      valid: false,
      detectedLang: 'romanized',
      reason: 'O título está em Romaji/Romaja/Pinyin (ex: "Na Honjaman Level-Up", "Ore Dake..."). Deve ser substituído pelo título oficial em inglês ou PT-BR.',
    };
  }

  if (isPortuguese(title)) {
    return { valid: true, detectedLang: 'pt-br' };
  }

  return { valid: true, detectedLang: 'en' };
}
