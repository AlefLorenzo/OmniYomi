import assert from 'assert';
import { normalizeMangaTitles, validateTitleLanguage, isNonLatinScript, isRomanizedTitle } from '../server/src/services/TitleNormalizer.js';
import { coverManager } from '../server/src/services/CoverManager.js';
import { deduplicationService } from '../server/src/services/DeduplicationService.js';
import { flareSolverrService } from '../server/src/services/FlareSolverrService.js';
import { extensionManager } from '../server/src/sources/ExtensionManager.js';
import { Manga } from '../server/src/types/index.js';

async function runPrecisionTestSuite() {
  console.log('\n========================================================================');
  console.log('  SUÍTE DE TESTES: CATÁLOGO POR EXTENSÃO, TÍTULOS PT-BR/EN E CAPAS');
  console.log('========================================================================\n');

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

  // -------------------------------------------------------------
  // TESTE A: SELEÇÃO DE EXTENSÃO E ISOLAMENTO RIGOROSO
  // -------------------------------------------------------------
  let mangaDexManga: Manga[] = [];
  let comikeyManga: Manga[] = [];

  await test('Teste A1 — Consulta à extensão MangaDex retorna exclusivamente obras do MangaDex', async () => {
    const mdSource = extensionManager.getSource('mangadex');
    assert.ok(mdSource, 'Fonte MangaDex deve estar registrada');

    const result = await mdSource.getPopular(1);
    assert.ok(result.manga.length > 0, 'MangaDex deve retornar obras');
    mangaDexManga = result.manga;

    for (const m of result.manga) {
      assert.strictEqual(m.sourceId, 'mangadex', `Toda obra deve ter sourceId 'mangadex', encontrado: ${m.sourceId}`);
      assert.ok(m.id.startsWith('mangadex:'), `ID da obra deve iniciar com 'mangadex:', encontrado: ${m.id}`);
    }
  });

  await test('Teste A2 — Consulta à extensão Comikey retorna exclusivamente obras da Comikey', async () => {
    const sources = extensionManager.getAllSources();
    const comikeySourceMeta = sources.find(s => s.id.includes('comikey'));
    assert.ok(comikeySourceMeta, 'Extensão Comikey deve estar registrada');

    const comikeyInst = extensionManager.getSource(comikeySourceMeta.id);
    assert.ok(comikeyInst, 'Instância da extensão Comikey deve estar disponível');

    const result = await comikeyInst.getPopular(1);
    assert.ok(result.manga.length > 0, 'Comikey deve retornar obras');
    comikeyManga = result.manga;

    for (const m of result.manga) {
      assert.strictEqual(m.sourceId, comikeySourceMeta.id, `Toda obra deve ter sourceId '${comikeySourceMeta.id}'`);
      assert.ok(m.id.startsWith(comikeySourceMeta.id), `ID da obra deve iniciar com prefixo da Comikey`);
    }
  });

  await test('Teste A3 — Isolamento total: Nenhuma obra de MangaDex está presente na Comikey ou vice-versa', () => {
    assert.ok(mangaDexManga.length > 0 && comikeyManga.length > 0, 'Ambas as extensões devem possuir obras para comparação');
    
    const mdIds = new Set(mangaDexManga.map(m => m.id));
    const comikeyIds = new Set(comikeyManga.map(m => m.id));

    for (const id of mdIds) {
      assert.strictEqual(comikeyIds.has(id), false, `Obra de MangaDex (${id}) NÃO pode aparecer na Comikey`);
    }

    for (const id of comikeyIds) {
      assert.strictEqual(mdIds.has(id), false, `Obra de Comikey (${id}) NÃO pode aparecer no MangaDex`);
    }
  });

  // -------------------------------------------------------------
  // TESTE B: IDIOMA DOS TÍTULOS — SOMENTE PT-BR OU INGLÊS
  // -------------------------------------------------------------
  await test('Teste B1 — Detecção e rejeição de títulos Romanizados (Romaji, Romaja, Pinyin)', () => {
    assert.strictEqual(isRomanizedTitle('Na Honjaman Level-Up'), true, 'Romaja coreana deve ser detectada');
    assert.strictEqual(isRomanizedTitle('Sono Bisque Doll wa Koi o Suru'), true, 'Romaji japonesa deve ser detectada');
    assert.strictEqual(isRomanizedTitle('Shingeki no Kyojin'), true, 'Romaji de Attack on Titan deve ser detectada');
    assert.strictEqual(isRomanizedTitle('Solo Leveling'), false, 'Título em inglês não é romanização');
    assert.strictEqual(isRomanizedTitle('My Dress-Up Darling'), false, 'Título em inglês não é romanização');
    assert.strictEqual(isRomanizedTitle('A Princesa Encantada'), false, 'Título em PT-BR não é romanização');
  });

  await test('Teste B2 — Normalização de Solo Leveling: promove "Solo Leveling" e remove "Na Honjaman Level-Up"', () => {
    const rawTitle = 'Na Honjaman Level-Up';
    const altTitles = [
      { ko: '나 혼자만 레벨업' },
      { en: 'Solo Leveling' },
      { 'ko-ro': 'Na Honjaman Lebel-eob' },
      { en: 'I level up alone' },
      { 'ja-ro': 'Ore Dake Level Up na Ken' }
    ];

    const normalized = normalizeMangaTitles(rawTitle, altTitles, 'pt-br', 'MangaDex API v5');
    assert.strictEqual(normalized.title, 'Solo Leveling', 'Título principal exibido deve ser "Solo Leveling"');
    assert.strictEqual(normalized.titleLang, 'en', 'Idioma identificado deve ser "en"');
    assert.strictEqual(normalized.originalTitle, 'Na Honjaman Level-Up', 'Título original deve ser preservado');

    const validation = validateTitleLanguage(normalized.title);
    assert.strictEqual(validation.valid, true, 'O título exibido deve ser aprovado pelo validador estrito');
    assert.strictEqual(validation.detectedLang, 'en');
  });

  await test('Teste B3 — Normalização de Sono Bisque Doll: promove "My Dress-Up Darling"', () => {
    const sonoRaw = 'Sono Bisque Doll wa Koi o Suru';
    const sonoAlts = [
      { ja: 'その着せ替え人形は恋をする' },
      { en: 'My Dress-Up Darling' },
      { en: 'The Bisque Doll Falls In Love' }
    ];

    const normalized = normalizeMangaTitles(sonoRaw, sonoAlts, 'pt-br', 'MangaDex API v5');
    assert.strictEqual(normalized.title, 'My Dress-Up Darling', 'Título principal exibido deve ser em inglês');
    assert.strictEqual(normalized.titleLang, 'en');
    assert.strictEqual(normalized.originalTitle, 'Sono Bisque Doll wa Koi o Suru');

    const validation = validateTitleLanguage(normalized.title);
    assert.strictEqual(validation.valid, true);
  });

  await test('Teste B4 — Todos os títulos retornados pelo catálogo MangaDex passam na validação de idioma', () => {
    let approved = 0;
    for (const m of mangaDexManga) {
      assert.ok(m.title && m.title.trim().length > 0, 'Título não pode estar vazio');
      const val = validateTitleLanguage(m.title);
      assert.strictEqual(val.valid, true, `Título "${m.title}" deve estar em PT-BR ou EN. Motivo: ${val.reason}`);
      approved++;
    }
    console.log(` (${approved}/${mangaDexManga.length} títulos aprovados)`);
  });

  // -------------------------------------------------------------
  // TESTE C: PRECISÃO E CARREGAMENTO DE CAPAS
  // -------------------------------------------------------------
  await test('Teste C1 — Verificação de URLs de capa retornadas pelo catálogo', () => {
    for (const m of mangaDexManga) {
      assert.ok(m.coverUrl && m.coverUrl.length > 0, `Obra "${m.title}" deve possuir coverUrl`);
      assert.ok(m.coverUrl.startsWith('http'), `coverUrl deve ser endereço absoluto: ${m.coverUrl}`);
    }

    for (const m of comikeyManga) {
      assert.ok(m.coverUrl && m.coverUrl.length > 0, `Obra "${m.title}" deve possuir coverUrl`);
      assert.ok(m.coverUrl.startsWith('http'), `coverUrl Comikey deve ser absoluto: ${m.coverUrl}`);
    }
  });

  await test('Teste C2 — Cache local e proxy de capa com auto-resolução de Referer', async () => {
    const sampleCover = mangaDexManga[0]?.coverUrl;
    assert.ok(sampleCover, 'Capa de teste deve existir');

    // Primeira consulta (baixa e armazena em cache validando magic bytes)
    const res1 = await coverManager.getOrFetchCover(sampleCover);
    assert.ok(res1.filePath, 'Deve salvar o arquivo binário em cache');
    assert.ok(res1.contentType.startsWith('image/'), `Content-Type deve ser de imagem: ${res1.contentType}`);

    // Segunda consulta (retorna imediatamente do cache local)
    const res2 = await coverManager.getOrFetchCover(sampleCover);
    assert.strictEqual(res2.isCached, true, 'Segunda consulta deve indicar cache local ativo');
    assert.strictEqual(res2.filePath, res1.filePath, 'Caminho do arquivo em cache deve ser idêntico');
  });

  await test('Teste C3 — Rejeição estrita de HTML de erro como imagem de capa', () => {
    const errorHtml = Buffer.from('<html><head><title>403 Forbidden</title></head><body>Cloudflare error</body></html>');
    const magicCheck = coverManager.validateMagicBytes(errorHtml);
    assert.strictEqual(magicCheck.valid, false, 'HTML de bloqueio NÃO pode ser considerado imagem válida');
  });

  // -------------------------------------------------------------
  // TESTE D: PAGINAÇÃO E RESET DE ESTADO NA TROCA DE FONTE
  // -------------------------------------------------------------
  await test('Teste D1 — Paginação de catálogo com avanço para página 2', async () => {
    const mdSource = extensionManager.getSource('mangadex')!;
    const p1 = await mdSource.getPopular(1);
    const p2 = await mdSource.getPopular(2);

    assert.ok(p1.manga.length > 0 && p2.manga.length > 0, 'Ambas as páginas devem possuir obras');
    assert.notStrictEqual(p1.manga[0].id, p2.manga[0].id, 'Primeira obra da pág 1 deve ser diferente da pág 2');
    assert.strictEqual(p2.page, 2, 'Página retornada deve ser 2');
  });

  console.log('\n========================================================================');
  console.log(`  RESULTADO: ${passed}/${total} TESTES APROVADOS! (${Math.round((passed / total) * 100)}%)`);
  console.log('========================================================================\n');

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
