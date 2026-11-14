import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probeUrl(label, url) {
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, timeout: 15000, maxRedirects: 5 });
    const $ = cheerio.load(r.data);
    console.log(`\n=== ${label} ===`);
    console.log('URL:', r.request.res?.responseUrl || url);
    console.log('Status:', r.status);
    console.log('Title:', $('title').text().trim().slice(0, 80));
    // Find manga items
    const selectors = [
      '.page-item-detail', '.bsx', '.item', 'article.manga', '.manga-item',
      '.comic-item', '.card', 'li.manga', 'div.list-truyen-item', 
      '.entry-manga', '.post-manga', '.item-thumb', '.bixbox'
    ];
    for (const sel of selectors) {
      const count = $(sel).length;
      if (count > 0) {
        const first = $(sel).first();
        const link = first.find('a').first().attr('href');
        const title = first.find('h3,h4,h5,span.title,.title,a').first().text().trim().slice(0,60);
        const img = first.find('img').first().attr('src') || first.find('img').first().attr('data-src');
        console.log(`  Selector "${sel}": ${count} items — title="${title}" href="${link}" img="${img}"`);
      }
    }
  } catch (e) {
    console.log(`\n=== ${label} ERROR ===`, e.message);
  }
}

await probeUrl('LycanToons', 'https://lycantoons.com');
await probeUrl('LycanToons /mangas', 'https://lycantoons.com/mangas');
await probeUrl('LycanToons /manga', 'https://lycantoons.com/manga');
await probeUrl('Imperio', 'https://imperiodabritannia.net');
await probeUrl('Imperio /manga', 'https://imperiodabritannia.net/manga');
await probeUrl('MangaFire', 'https://mangafire.to/home');
await probeUrl('MangaFire /filter', 'https://mangafire.to/filter?sort=trending');
await probeUrl('MangaBall', 'https://mangaball.net');
