import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probeApi(label, url, opts = {}) {
  try {
    const r = await axios.get(url, {
      headers: { 'User-Agent': UA, ...opts.headers },
      timeout: 15000, maxRedirects: 5,
    });
    console.log(`\n=== ${label} ===`);
    console.log('Status:', r.status, '| Content-Type:', r.headers['content-type']?.slice(0,80));
    const data = typeof r.data === 'string' ? r.data.slice(0, 1500) : JSON.stringify(r.data).slice(0, 1500);
    console.log(data);
  } catch (e) {
    const msg = e.response?.data;
    const preview = typeof msg === 'string' ? msg.slice(0,200) : JSON.stringify(msg)?.slice(0,200) || '';
    console.log(`\n=== ${label} ERROR ===`, e.message, e.response?.status || '', preview);
  }
}

// MangaFire uses internal API endpoints that the Tachiyomi ext knows about
// From tachiyomi source: MangaFire uses /api endpoint + decrypts with token
await probeApi('MangaFire /v1/manga', 'https://mangafire.to/v1/manga/trending?page=1', {headers:{'X-Requested-With':'XMLHttpRequest','Referer':'https://mangafire.to/'}});
await probeApi('MangaFire /api', 'https://mangafire.to/api/manga/trending?page=1', {headers:{'X-Requested-With':'XMLHttpRequest','Referer':'https://mangafire.to/'}});

// Try MangaBall proper URL
await probeApi('MangaBall main', 'https://mangaball.net', {headers:{'Accept':'text/html','User-Agent':UA}});

// Comikey
await probeApi('Comikey web', 'https://comikey.com', {headers:{'Accept':'text/html'}});
await probeApi('Comikey /comics', 'https://comikey.com/comics', {headers:{'Accept':'text/html'}});

// Lycan Toons with more headers
await probeApi('LycanToons with Cloudflare bypass attempt', 'https://lycantoons.com', {
  headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  }
});
