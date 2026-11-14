import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function testComikey() {
  try {
    const res = await axios.get('https://comikey.com/comics/', { headers: { 'User-Agent': UA }, timeout: 10000 });
    const $ = cheerio.load(res.data);
    const manga = [];
    $('ul.grid > li, .comic-item, div.grid > div').each((_, el) => {
      const a = $(el).find('a[href*="/comics/"]').first();
      const href = a.attr('href');
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
      const title = $(el).find('.font-bold, h3, h4, span.title').text().trim() || a.attr('title') || $(el).find('img').attr('alt')?.replace(/^Thumbnail for /, '');
      if (href && title && !href.endsWith('/comics/')) {
        manga.push({ title, href, img });
      }
    });
    console.log('Comikey parsed:', manga.length, 'sample:', manga[0]);
  } catch (e) {
    console.log('Comikey failed:', e.message);
  }
}

async function testMangaThemesia() {
  // Asura / Flame / Reaper style
  try {
    const res = await axios.get('https://asuracomic.net', { headers: { 'User-Agent': UA }, timeout: 10000 });
    console.log('Asura status:', res.status);
  } catch (e) {
    console.log('Asura failed:', e.message);
  }
}

async function testManganato() {
  try {
    const res = await axios.get('https://manganato.com', { headers: { 'User-Agent': UA }, timeout: 10000 });
    const $ = cheerio.load(res.data);
    const count = $('.content-genres-item, .itemupdate').length;
    console.log('Manganato status:', res.status, 'items:', count);
  } catch (e) {
    console.log('Manganato failed:', e.message);
  }
}

await testComikey();
await testMangaThemesia();
await testManganato();
