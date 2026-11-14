import axios from 'axios';
import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function testComikey() {
  const r = await axios.get('https://comikey.com/comics/', { headers: { 'User-Agent': UA } });
  const $ = cheerio.load(r.data);
  console.log('Comikey /comics items:');
  const items = [];
  $('a[href*="/comics/"]').each((i, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().trim() || $(el).attr('title') || $(el).find('img').attr('alt');
    const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
    if (href && title && href !== '/comics/' && !items.find(x => x.href === href)) {
      items.push({ href, title, img });
    }
  });
  console.log('Total comics found:', items.length);
  console.log('Sample 5:', items.slice(0, 5));
}

testComikey();
