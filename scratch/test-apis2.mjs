import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probeApi(label, url, opts = {}) {
  try {
    const r = await axios.get(url, {
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...opts.headers },
      timeout: 15000,
      maxRedirects: 5,
      responseType: opts.binary ? 'arraybuffer' : 'json',
    });
    console.log(`\n=== ${label} ===`);
    console.log('Status:', r.status, '| Content-Type:', r.headers['content-type']?.slice(0,80));
    const data = typeof r.data === 'string' ? r.data.slice(0, 800)
      : r.data instanceof Buffer ? r.data.toString().slice(0, 800)
      : JSON.stringify(r.data).slice(0, 800);
    console.log(data);
  } catch (e) {
    const msg = e.response?.data;
    const preview = typeof msg === 'string' ? msg.slice(0,100) : JSON.stringify(msg)?.slice(0,100) || '';
    console.log(`\n=== ${label} ERROR ===`, e.message, e.response?.status || '', preview);
  }
}

// MangaFire - Tachiyomi ext uses: Ajax calls with specific path
await probeApi('MangaFire /az-list', 'https://mangafire.to/az-list?page=1');
await probeApi('MangaFire /filter ajax', 'https://mangafire.to/filter?sort=trending', {headers:{'X-Requested-With':'XMLHttpRequest','Referer':'https://mangafire.to/'}});
await probeApi('MangaFire search AJAX', 'https://mangafire.to/filter?keyword=naruto&sort=recently_updated', {headers:{'X-Requested-With':'XMLHttpRequest','Referer':'https://mangafire.to/'}});

// MangaBall
await probeApi('MangaBall /api/manhwas', 'https://mangaball.com/api/manhwas?page=1&limit=20', {headers:{'Referer':'https://mangaball.com/','Accept':'application/json'}});
await probeApi('MangaBall /_next/data', 'https://mangaball.com/_next/data/comics.json', {headers:{'Referer':'https://mangaball.com/'}});
await probeApi('MangaBall /manhwas page', 'https://mangaball.com/manhwas?page=1', {headers:{'Accept':'text/html','User-Agent':UA}});

// Imperio - try to find the API from the SPA JS bundle
await probeApi('Imperio JS bundle lookup', 'https://imperiodabritannia.net/assets/index-C6KkTWCj.js', {headers:{'Accept':'*/*','Referer':'https://imperiodabritannia.net/'}});
