import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probeApi(label, url, opts = {}) {
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'pt-BR,pt;q=0.9', ...opts.headers }, timeout: 15000, maxRedirects: 5 });
    console.log(`\n=== ${label} ===`);
    console.log('Status:', r.status, '| Content-Type:', r.headers['content-type']?.slice(0,60));
    const data = typeof r.data === 'string' ? r.data.slice(0, 1000) : JSON.stringify(r.data).slice(0, 1000);
    console.log(data);
  } catch (e) {
    console.log(`\n=== ${label} ERROR ===`, e.message, e.response?.status, e.response?.data?.slice?.(0,200));
  }
}

// Imperio da Britannia - try common API endpoints
await probeApi('Imperio /api/comics', 'https://imperiodabritannia.net/api/comics?page=1&limit=20');
await probeApi('Imperio /api/manga', 'https://imperiodabritannia.net/api/manga?page=1');
await probeApi('Imperio /api/obras', 'https://imperiodabritannia.net/api/obras?page=1');
await probeApi('Imperio /api/series', 'https://imperiodabritannia.net/api/series?page=1');

console.log('\n--- MangaFire ---');
// MangaFire - check if it has an API
await probeApi('MangaFire /filter JSON', 'https://mangafire.to/filter?sort=trending', { headers: {'X-Requested-With': 'XMLHttpRequest'} });

console.log('\n--- MangaBall ---');
await probeApi('MangaBall /api', 'https://mangaball.net/api/comics?page=1&sort=trending');
await probeApi('MangaBall /api/comics', 'https://mangaball.com/api/comics?page=1&sort=trending');
