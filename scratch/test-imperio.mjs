import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probeHtml(label, url) {
  try {
    const r = await axios.get(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' }, timeout: 15000, maxRedirects: 5 });
    const $ = cheerio.load(r.data);
    console.log(`\n=== ${label} ===`);
    console.log('Title:', $('title').text().trim().slice(0, 80));
    // dump first 3000 chars of body to see structure
    const bodyText = r.data.slice(0, 4000);
    console.log(bodyText);
  } catch (e) {
    console.log(`\n=== ${label} ERROR ===`, e.message);
  }
}

// Imperio da Britannia manga list page
await probeHtml('Imperio /manga', 'https://imperiodabritannia.net/manga');
