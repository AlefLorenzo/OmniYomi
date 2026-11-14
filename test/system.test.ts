import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../server/src/db/database.js';
import { extensionManager } from '../server/src/sources/ExtensionManager.js';
import { downloadManager } from '../server/src/services/DownloadManager.js';
import { libraryManager } from '../server/src/services/LibraryManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('  INICIANDO SUÍTE DE TESTES AUTOMATIZADOS - OMNIYOMI');
  console.log('======================================================\n');

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

  // 1. Database & Settings
  await test('Banco de dados SQLite inicializado e tabelas migradas', () => {
    const settings = db.getSettings();
    assert.ok(settings, 'Configurações devem existir');
    assert.strictEqual(typeof settings.port, 'number');
    assert.ok(settings.downloadPath.length > 0);
  });

  // 2. Categories
  await test('Gerenciamento de Categorias (CRUD)', () => {
    const defaultCats = db.getCategories();
    assert.ok(defaultCats.length >= 4, 'Categorias padrão devem existir');

    const testCat = db.createCategory('Teste Unitario');
    assert.strictEqual(testCat.name, 'Teste Unitario');

    db.deleteCategory(testCat.id);
    const afterDelete = db.getCategories();
    assert.strictEqual(afterDelete.find(c => c.id === testCat.id), undefined);
  });

  // 3. Extension Manager & Sources
  await test('Registro e carregamento de fontes modulares (MangaDex, Local, WeebCentral)', () => {
    const sources = extensionManager.getAllSources();
    assert.ok(sources.length >= 3, `Deve ter pelo menos 3 fontes (encontradas: ${sources.length})`);

    const mangadex = extensionManager.getSource('mangadex');
    assert.ok(mangadex, 'Fonte MangaDex deve estar registrada');

    const local = extensionManager.getSource('local');
    assert.ok(local, 'Fonte Armazenamento Local deve estar registrada');

    const weebcentral = extensionManager.getSource('weebcentral');
    assert.ok(weebcentral, 'Extensão WeebCentral deve estar registrada');
  });

  // 4. Source Health Check
  await test('Verificação de conectividade e integridade da fonte MangaDex', async () => {
    const health = await extensionManager.checkSourceHealth('mangadex');
    assert.strictEqual(health.status, 'OK', `MangaDex deve estar operacional: ${health.message}`);
  });

  // 5. Live Catalog & Search
  let searchTargetManga: any = null;
  await test('Pesquisa de obras em fonte real (MangaDex API)', async () => {
    const mangadex = extensionManager.getSource('mangadex')!;
    const searchRes = await mangadex.search('Solo Leveling', 1);

    assert.ok(searchRes.manga.length > 0, 'Deve retornar ao menos 1 obra');
    searchTargetManga = searchRes.manga[0];
    assert.ok(searchTargetManga.id.startsWith('mangadex:'), 'ID deve ter prefixo de fonte');
    assert.ok(searchTargetManga.title.length > 0, 'Título deve ser válido');
    assert.ok(searchTargetManga.coverUrl.length > 0, 'Capa deve ter URL');
  });

  // 6. Chapter Listing
  let testChapter: any = null;
  await test('Extração de capítulos reais com ordenação e numeração', async () => {
    const mangadex = extensionManager.getSource('mangadex')!;
    const chapters = await mangadex.getChapterList(searchTargetManga.sourceMangaId);

    assert.ok(chapters.length > 0, 'Deve conter capítulos');
    // Select a chapter to test download
    testChapter = chapters.find(c => c.totalPages > 0 && c.totalPages <= 15) || chapters[chapters.length - 1];
    assert.ok(testChapter.id, 'Capítulo deve ter ID único');
    assert.strictEqual(typeof testChapter.chapterNumber, 'number');

    // Salvar capítulos no DB local
    db.saveOrUpdateManga(searchTargetManga);
    db.saveChapters(chapters);
  });

  // 7. Page List Extraction
  let samplePages: any[] = [];
  await test('Extração de lista de imagens/páginas do capítulo', async () => {
    const mangadex = extensionManager.getSource('mangadex')!;
    samplePages = await mangadex.getPageList(testChapter.sourceChapterId);

    assert.ok(samplePages.length > 0, 'Capítulo deve conter páginas');
    assert.ok(samplePages[0].url.startsWith('http'), 'URL da imagem deve ser válida');
  });

  // 8. Download System & Integrity Check
  await test('Download, validação de integridade mágica e armazenamento local', async () => {
    // Baixar o capítulo de teste
    const dlItem = await downloadManager.enqueue(testChapter, searchTargetManga.title, searchTargetManga.coverUrl);
    assert.ok(dlItem, 'Item de download deve ser enfileirado');

    // Aguardar conclusão do download (até 60s)
    let tries = 0;
    while (tries < 120) {
      await new Promise(r => setTimeout(r, 500));
      const currentDl = db.getDownloads().find(d => d.chapterId === testChapter.id);
      if (currentDl?.status === 'COMPLETED' || currentDl?.status === 'FAILED') break;
      tries++;
    }

    const completed = db.getDownloads().find(d => d.chapterId === testChapter.id);
    assert.strictEqual(completed?.status, 'COMPLETED', `Download deve completar: ${completed?.error}`);

    // Validar existência física dos arquivos em disco
    const updatedCh = db.getChapterById(testChapter.id);
    assert.ok(updatedCh?.isDownloaded, 'Capítulo deve estar marcado como baixado');
    assert.ok(updatedCh?.downloadedPath && fs.existsSync(updatedCh.downloadedPath), 'Diretório local deve existir');

    const files = fs.readdirSync(updatedCh.downloadedPath!);
    assert.ok(files.length > 0, 'Deve conter arquivos de páginas');

    // Validar integridade da primeira imagem
    const firstImagePath = path.join(updatedCh.downloadedPath!, files[0]);
    const isValid = downloadManager.isValidImageFile(firstImagePath);
    assert.strictEqual(isValid, true, 'Arquivo baixado deve possuir assinatura mágica de imagem válida');
  });

  // 9. Offline Reading Capability
  await test('Leitura offline de capítulo baixado (sem requisição à rede)', () => {
    const ch = db.getChapterById(testChapter.id);
    assert.ok(ch?.isDownloaded, 'Capítulo deve estar marcado como offline');
    assert.ok(ch?.downloadedPath, 'Caminho local deve estar preenchido');

    const files = fs.readdirSync(ch.downloadedPath!)
      .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));
    assert.ok(files.length > 0, 'Páginas locais devem ser lidas diretamente do sistema de arquivos');
  });

  // 10. Reading Progress & History
  await test('Memorização de posição de leitura e registro no histórico', () => {
    db.updateChapterProgress(testChapter.id, 5, 20, false);

    const ch = db.getChapterById(testChapter.id);
    assert.strictEqual(ch?.lastPageRead, 5);
    assert.strictEqual(ch?.isRead, false);

    const history = db.getReadingHistory(10);
    const foundHistory = history.find(h => h.chapterId === testChapter.id);
    assert.ok(foundHistory, 'Histórico deve conter a leitura registrada');
    assert.strictEqual(foundHistory?.page, 5);
  });

  // 11. Library & Unread Counts
  await test('Gerenciamento de Biblioteca, Favoritos e contadores de não lidos', () => {
    db.setMangaInLibrary(searchTargetManga.id, true, 'reading');
    const libManga = db.getLibraryManga();
    const found = libManga.find(m => m.id === searchTargetManga.id);

    assert.ok(found, 'Obra deve estar presente na biblioteca');
    assert.strictEqual(found?.categoryId, 'reading');
  });

  // 12. Local Storage Source Scanner
  await test('Armazenamento Local (Offline scanner)', async () => {
    const local = extensionManager.getSource('local')!;
    const res = await local.getPopular(1);
    assert.ok(Array.isArray(res.manga), 'Deve retornar lista mesmo se vazia');
  });

  // 13. Tachiyomi Extension Repositories (index.min.json extraction)
  await test('Extração de extensões do repositório Suwayomi/Tachiyomi (index.min.json)', async () => {
    const { repoManager } = await import('../server/src/services/RepoManager.js');
    const repoUrl = 'https://raw.githubusercontent.com/Suwayomi/tachiyomi-extension/repo/index.min.json';
    const exts = await repoManager.fetchRepoExtensions(repoUrl);

    assert.ok(exts.length > 0, 'Deve extrair extensões do link index.min.json');
    assert.strictEqual(exts[0].pkg, 'eu.kanade.tachiyomi.extension.all.tachidesk');
    assert.ok(exts[0].apkUrl.endsWith('.apk'), 'URL do APK deve ser válida');
    assert.ok(exts[0].sources.length > 0, 'Fontes da extensão devem ser extraídas');
  });

  // 14. Protocol Buffers Repositories (index.pb extraction)
  await test('Decodificação e extração de repositórios Protocol Buffers (.pb) - Cursed Yūzōnō & FelipeGFA', async () => {
    const { repoManager } = await import('../server/src/services/RepoManager.js');
    const pbUrl = 'https://raw.githubusercontent.com/mojuru/cursed-manga-repo/repo/index.pb';
    const exts = await repoManager.fetchRepoExtensions(pbUrl);

    assert.ok(exts.length > 0, 'Deve extrair extensões do arquivo index.pb compactado');
    const ehentai = exts.find(e => e.pkg.includes('ehentai'));
    assert.ok(ehentai, 'Deve encontrar extensão ehentai no arquivo .pb');
    assert.ok(ehentai.sources.length > 0, 'Deve conter fontes com idiomas decodificados');
  });

  // 15. Kavita Repository (index.min.json)
  await test('Extração de extensões do repositório Kavita', async () => {
    const { repoManager } = await import('../server/src/services/RepoManager.js');
    const kavitaUrl = 'https://raw.githubusercontent.com/Kareadita/tach-extension/repo/index.min.json';
    const exts = await repoManager.fetchRepoExtensions(kavitaUrl);

    assert.ok(exts.length > 0, 'Deve extrair extensões do repositório Kavita');
    assert.ok(exts.some(e => e.pkg.includes('kavita')), 'Deve conter extensão do Kavita');
  });

  console.log('\n======================================================');
  console.log(`  RESULTADO: ${passed}/${total} TESTES APROVADOS! (${Math.round((passed / total) * 100)}%)`);
  console.log('======================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Falha crítica na suíte de testes:', err);
  process.exit(1);
});
