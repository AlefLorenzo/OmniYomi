import assert from 'assert';
import { normalizeMangaTitles, validateTitleLanguage, isNonLatinScript } from '../server/src/services/TitleNormalizer.js';
import { coverManager } from '../server/src/services/CoverManager.js';
import { deduplicationService, generateCanonicalSlug } from '../server/src/services/DeduplicationService.js';
import { flareSolverrService } from '../server/src/services/FlareSolverrService.js';
import { extensionManager } from '../server/src/sources/ExtensionManager.js';
import { Manga } from '../server/src/types/index.js';

async function runPrecisionTestSuite() {
  console.log('\n================================================================');
  console.log('  SUÍTE DE VALIDAÇÃO: CATÁLOGO MULTIFONTES COM PRECISÃO TOTAL');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    process.stdout.write(`[${total}] Testando: ${name}... `);
    try {
      await fn();
      console.log('✅ APROVADO');
      passed++;
    } catch (err: any) {
      console.log('❌ FALHOU');
      console.error('    Erro:', err.message);
    }
  }

  // 1. REGRA 1: Validação de idioma dos títulos (nunca CJK / Hangul como principal)
  await test('Detecção de scripts não-latinos (CJK, Hangul, Árabe)', () => {
    assert.strictEqual(isNonLatinScript('ワンピース'), true, 'Japonês deve ser detectado');
    assert.strictEqual(isNonLatinScript('나 혼자만 레벨업'), true, 'Coreano Hangul deve ser detectado');
    assert.strictEqual(isNonLatinScript('斗罗大陆'), true, 'Chinês Hanzi deve ser detectado');
    assert.strictEqual(isNonLatinScript('Solo Leveling'), false, 'Inglês é latino e permitido');
    assert.strictEqual(isNonLatinScript('O Início Depois do Fim'), false, 'PT-BR é latino e permitido');
  });

  await test('Normalização e Priorização: Inversão de CJK bruto para Título Original', () => {
    const rawKorean = '나 혼자만 레벨업';
    const altTitles = ['Solo Leveling', 'I Level Up Alone', 'Ore Dake Level Up na Ken'];

    const normalized = normalizeMangaTitles(rawKorean, altTitles, 'pt-br');

    assert.strictEqual(normalized.title, 'Solo Leveling', 'Título principal deve ser o título latino (EN/PT-BR)');
    assert.strictEqual(normalized.originalTitle, '나 혼자만 레벨업', 'Título coreano deve ser preservado como originalTitle');
    assert.ok(!isNonLatinScript(normalized.title), 'Título principal NUNCA pode ter caracteres CJK/Hangul');
    assert.ok(normalized.altTitles.includes('I Level Up Alone'), 'Outras alternativas devem ser preservadas');
  });

  await test('Validador estrito de conformidade de idioma rejeita CJK como principal', () => {
    const invalidRes = validateTitleLanguage('呪術廻戦');
    assert.strictEqual(invalidRes.valid, false, 'Deve rejeitar título principal em kanji');

    const validRes = validateTitleLanguage('Jujutsu Kaisen');
    assert.strictEqual(validRes.valid, true, 'Deve aceitar título principal em caracteres latinos');

    const ptRes = validateTitleLanguage('A Garota de Fogo');
    assert.strictEqual(ptRes.valid, true, 'Deve aceitar título em PT-BR');
  });

  // 2. REGRA 2: Validação de Capas e Magic Bytes
  await test('Validação de integridade de imagens por Magic Bytes (evita HTML como capa)', () => {
    // Buffer simulando resposta de erro HTML de Cloudflare
    const fakeHtmlBuffer = Buffer.from('<!DOCTYPE html><html><body>Error 403 Forbidden</body></html>');
    const fakeRes = coverManager.validateMagicBytes(fakeHtmlBuffer);
    assert.strictEqual(fakeRes.valid, false, 'HTML de erro deve ser rejeitado como imagem');

    // Buffer de JPEG real: FF D8 FF
    const realJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const jpegRes = coverManager.validateMagicBytes(realJpegBuffer);
    assert.strictEqual(jpegRes.valid, true, 'JPEG com magic bytes válidos deve ser aceito');
    assert.strictEqual(jpegRes.format, 'image/jpeg');

    // Buffer de PNG real: 89 50 4E 47
    const realPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngRes = coverManager.validateMagicBytes(realPngBuffer);
    assert.strictEqual(pngRes.valid, true, 'PNG com magic bytes válidos deve ser aceito');
    assert.strictEqual(pngRes.format, 'image/png');
  });

  await test('Geração determinística de chave de cache para capas', () => {
    const key1 = coverManager.getCacheKey('https://cdn.manga.com/cover1.jpg', 'https://manga.com');
    const key2 = coverManager.getCacheKey('https://cdn.manga.com/cover1.jpg', 'https://manga.com');
    const key3 = coverManager.getCacheKey('https://cdn.manga.com/cover2.jpg', 'https://manga.com');

    assert.strictEqual(key1, key2, 'Mesma URL e referer devem produzir exatamente a mesma chave de cache');
    assert.notStrictEqual(key1, key3, 'URLs diferentes devem produzir chaves diferentes');
  });

  // 3. REGRA 4: Isolamento estrito por extensão (sem misturar fontes)
  await test('Isolamento estrito de catálogo por extensão', async () => {
    const sources = extensionManager.getAllSources().filter(s => s.isEnabled);
    assert.ok(sources.length >= 2, 'Deve ter pelo menos 2 fontes ativas');

    const sourceA = sources[0];
    const sourceB = sources[1];

    const instA = extensionManager.getSource(sourceA.id)!;
    const instB = extensionManager.getSource(sourceB.id)!;

    const resA = await instA.getPopular(1);
    const resB = await instB.getPopular(1);

    for (const m of resA.manga) {
      assert.strictEqual(m.sourceId, sourceA.id, `Obra de ${sourceA.id} deve ter sourceId estrito`);
      assert.ok(m.id.startsWith(sourceA.id), `ID da obra deve iniciar com prefixo da fonte ${sourceA.id}`);
    }

    for (const m of resB.manga) {
      assert.strictEqual(m.sourceId, sourceB.id, `Obra de ${sourceB.id} deve ter sourceId estrito`);
    }
  });

  // 4. REGRA 7: Identificação e Deduplicação entre fontes
  await test('Deduplicação de obras idênticas de fontes diferentes', () => {
    const m1: Manga = {
      id: 'mangadex:123',
      sourceId: 'mangadex',
      sourceName: 'MangaDex',
      sourceMangaId: '123',
      title: 'Solo Leveling',
      altTitles: ['Na Honjaman Level-Up'],
      description: 'Hunter Sung Jin-Woo',
      author: 'Chugong',
      artist: 'DUBU',
      genres: ['Action', 'Fantasy'],
      status: 'COMPLETED',
      coverUrl: 'https://m.com/1.jpg',
      inLibrary: true,
      categoryId: 'reading',
      totalChapters: 200,
      unreadCount: 0,
      downloadedCount: 0,
      lastChapterNumber: 200,
      lastReadChapterId: null,
      lastReadAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const m2: Manga = {
      id: 'apk:eu.kanade.tachiyomi.extension.pt.imperiodabritannia:7355:solo-leveling',
      sourceId: 'apk:eu.kanade.tachiyomi.extension.pt.imperiodabritannia:7355',
      sourceName: 'Sagrado Império',
      sourceMangaId: 'solo-leveling',
      title: 'Solo Leveling',
      altTitles: ['I Level Up Alone'],
      description: 'Caçador Sung Jin-Woo',
      author: 'Chugong',
      artist: 'DUBU',
      genres: ['Ação'],
      status: 'COMPLETED',
      coverUrl: 'https://i.com/2.jpg',
      inLibrary: false,
      categoryId: null,
      totalChapters: 179,
      unreadCount: 0,
      downloadedCount: 0,
      lastChapterNumber: 179,
      lastReadChapterId: null,
      lastReadAt: null,
      createdAt: 2000,
      updatedAt: 2000,
    };

    assert.strictEqual(deduplicationService.isSameWork(m1, m2), true, 'Obras com mesmo título e autor devem ser reconhecidas como mesma obra');

    const groups = deduplicationService.groupMangaAcrossSources([m1, m2]);
    assert.strictEqual(groups.length, 1, 'Deve agrupar em 1 grupo canônico');
    assert.strictEqual(groups[0].sources.length, 2, 'Grupo deve conter as 2 fontes distintas preservadas');
    assert.strictEqual(groups[0].sources[0].sourceId, 'mangadex');
    assert.strictEqual(groups[0].sources[1].sourceId, 'apk:eu.kanade.tachiyomi.extension.pt.imperiodabritannia:7355');
  });

  // 5. REGRA 6: FlareSolverr Service Health & Fallback
  await test('Verificação de integridade do FlareSolverr e fallback gracioso', async () => {
    const health = await flareSolverrService.checkHealth();
    assert.ok(typeof health.available === 'boolean', 'Status de disponibilidade deve ser booleano');
    assert.ok(health.message.length > 0, 'Mensagem descritiva deve estar presente');
  });

  console.log('\n================================================================');
  console.log(`  RESULTADO: ${passed}/${total} TESTES DE PRECISÃO APROVADOS! (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPrecisionTestSuite().catch(err => {
  console.error('Falha crítica nos testes de precisão:', err);
  process.exit(1);
});
