import assert from 'assert';
import axios from 'axios';
import { extensionManager } from '../server/src/sources/ExtensionManager.js';
import { suwayomiService } from '../server/src/services/SuwayomiService.js';
import { repoManager } from '../server/src/services/RepoManager.js';
import { coverManager } from '../server/src/services/CoverManager.js';
import { validateTitleLanguage } from '../server/src/services/TitleNormalizer.js';
import { Manga, Chapter, PageImage } from '../server/src/types/index.js';

async function runTachiyomiRealExecutionTests() {
  console.log('\n========================================================================');
  console.log('  SUÍTE DE TESTES: EXECUÇÃO REAL DE EXTENSÕES TACHIYOMI VIA DEX RUNTIME');
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

  // 1. Conectividade do Runtime Suwayomi
  await test('Teste 1 — Runtime Suwayomi Server ativo e respondendo na porta 4568', async () => {
    const healthy = await suwayomiService.ensureRunning();
    assert.strictEqual(healthy, true, 'Suwayomi Server deve estar respondendo');
  });

  // 2. Consulta de fontes registradas
  let mangafirePtBrSource: any = null;
  await test('Teste 2 — Fonte MangaFire (PT-BR) registrada e identificada', () => {
    const sources = extensionManager.getAllSources();
    mangafirePtBrSource = sources.find(
      (s) => s.id.includes('mangafire') && s.id.includes('7842137233968841729')
    ) || sources.find(
      (s) => s.id.includes('mangafire') && s.lang.toLowerCase().includes('pt')
    );
    assert.ok(mangafirePtBrSource, 'Fonte MangaFire (PT-BR) deve estar disponível no ExtensionManager');
    console.log(` (${mangafirePtBrSource.name} - ${mangafirePtBrSource.id})`);
  });

  // 3. Execução real do catálogo popular
  let popularWorks: Manga[] = [];
  await test('Teste 3 — Execução de getPopular() na extensão retorna obras reais', async () => {
    const sourceInst = extensionManager.getSource(mangafirePtBrSource.id);
    assert.ok(sourceInst, 'Instância da fonte deve existir');

    const result = await sourceInst.getPopular(1);
    assert.ok(result.manga.length > 0, 'Extensão deve retornar lista de obras reais');
    popularWorks = result.manga;
    console.log(` (${popularWorks.length} obras retornadas)`);

    for (const m of popularWorks) {
      assert.strictEqual(m.sourceId, mangafirePtBrSource.id, 'Todas as obras devem pertencer à extensão');
      assert.ok(m.title && m.title.trim().length > 0, 'Obra deve ter título válido');
      assert.ok(m.coverUrl && m.coverUrl.startsWith('http'), 'Obra deve possuir capa absoluta');
    }
  });

  // 4. Validação de títulos em PT-BR ou EN
  await test('Teste 4 — Todos os títulos retornados estão em PT-BR ou Inglês', () => {
    let approved = 0;
    for (const m of popularWorks) {
      const val = validateTitleLanguage(m.title);
      assert.strictEqual(val.valid, true, `Título "${m.title}" deve ser válido. Motivo: ${val.reason}`);
      approved++;
    }
    console.log(` (${approved}/${popularWorks.length} títulos aprovados)`);
  });

  // 5. Carregamento e validação de capa via proxy/cache
  await test('Teste 5 — Download e integridade binária da capa da primeira obra', async () => {
    const sample = popularWorks[0];
    assert.ok(sample, 'Obra de teste deve existir');

    const coverResult = await coverManager.getOrFetchCover(sample.coverUrl);
    assert.ok(coverResult.filePath, 'Capa deve ser salva no cache');
    assert.ok(coverResult.contentType.startsWith('image/'), 'Content-Type deve ser imagem');
  });

  // 6. Extração real de capítulos
  let chapters: Chapter[] = [];
  await test('Teste 6 — Extração completa de capítulos reais (getChapterList)', async () => {
    const sourceInst = extensionManager.getSource(mangafirePtBrSource.id)!;
    const sample = popularWorks[0];

    chapters = await sourceInst.getChapterList(sample.sourceMangaId);
    assert.ok(chapters.length > 0, 'Extensão deve retornar capítulos');
    console.log(` (${chapters.length} capítulos encontrados para "${sample.title}")`);

    const first = chapters[0];
    assert.ok(first.id, 'Capítulo deve ter ID');
    assert.ok(first.title, 'Capítulo deve ter título');
    assert.ok(typeof first.chapterNumber === 'number', 'Capítulo deve ter número');
  });

  // 7. Extração de páginas do capítulo
  let pages: PageImage[] = [];
  await test('Teste 7 — Extração da lista de páginas do capítulo (getPageList)', async () => {
    const sourceInst = extensionManager.getSource(mangafirePtBrSource.id)!;
    const sampleChapter = chapters[0];

    pages = await sourceInst.getPageList(sampleChapter.sourceChapterId, sampleChapter.url);
    assert.ok(pages.length > 0, 'Capítulo deve possuir páginas de imagens');
    console.log(` (${pages.length} páginas extraídas)`);

    const firstPage = pages[0];
    assert.strictEqual(firstPage.index, 1);
    assert.ok(firstPage.url.includes('/api/proxy/image'), 'URL da página deve utilizar o proxy do aplicativo');
  });

  // 8. Download e validação da primeira página do capítulo
  await test('Teste 8 — Download e validação da imagem da primeira página', async () => {
    const firstPage = pages[0];
    const encodedUrl = firstPage.url.split('url=')[1];
    const rawImageUrl = decodeURIComponent(encodedUrl);

    const res = await axios.get(rawImageUrl, {
      responseType: 'arraybuffer',
      timeout: 25000,
    });

    assert.strictEqual(res.status, 200, 'Download da imagem deve retornar HTTP 200');
    assert.ok(res.data.length > 1000, 'Tamanho da imagem deve ser maior que 1KB');

    const buffer = Buffer.from(res.data);
    const magic = coverManager.validateMagicBytes(buffer);
    assert.strictEqual(magic.valid, true, `Magic bytes da página devem ser imagem válida (detectado: ${magic.format})`);
  });

  // 9. Pesquisa real na extensão
  await test('Teste 9 — Pesquisa (search) na extensão retorna obras filtradas', async () => {
    const sourceInst = extensionManager.getSource(mangafirePtBrSource.id)!;
    const searchRes = await sourceInst.search('Piece', 1);

    assert.ok(searchRes.manga.length > 0, 'Pesquisa por "Piece" deve retornar obras');
    const match = searchRes.manga.some((m) => m.title.toLowerCase().includes('piece'));
    assert.strictEqual(match, true, 'Deve conter pelo menos uma obra contendo "Piece"');
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

runTachiyomiRealExecutionTests().catch((err) => {
  console.error('Falha crítica na suíte de testes Tachiyomi:', err);
  process.exit(1);
});
