class WeebCentralSource extends BaseSource {
  constructor() {
    super();
    this.id = 'weebcentral';
    this.name = 'WeebCentral';
    this.version = '1.0.2';
    this.lang = 'en';
    this.iconUrl = 'https://weebcentral.com/favicon.ico';
    this.baseUrl = 'https://weebcentral.com';
    this.isNsfw = false;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }

  async getPopular(page = 1) {
    return this.search('', page);
  }

  async getLatest(page = 1) {
    const url = `${this.baseUrl}/search/data?sort=Latest%20Updates&order=Descending&page=${page}`;
    return this.fetchSearch(url, page);
  }

  async search(query = '', page = 1) {
    let url = `${this.baseUrl}/search/data?sort=Popularity&order=Ascending&page=${page}&display_mode=Full%20Display`;
    if (query && query.trim()) {
      url = `${this.baseUrl}/search/data?text=${encodeURIComponent(query.trim())}&page=${page}&display_mode=Full%20Display`;
    }
    return this.fetchSearch(url, page);
  }

  async fetchSearch(url, page) {
    const res = await axios.get(url, { headers: this.headers });
    const $ = cheerio.load(res.data);
    const manga = [];

    $('article').each((i, el) => {
      const a = $(el).find('a.link');
      const href = a.attr('href') || '';
      const parts = href.split('/');
      const sourceMangaId = parts[4];
      const title = a.text().trim();
      const coverUrl = $(el).find('img').attr('src') || '';
      const desc = $(el).find('.description, p').text().trim();

      if (sourceMangaId && title) {
        manga.push({
          id: `${this.id}:${sourceMangaId}`,
          sourceId: this.id,
          sourceMangaId,
          title,
          altTitles: [],
          description: desc,
          author: 'Unknown',
          artist: 'Unknown',
          genres: ['Manga', 'Manhwa'],
          status: 'ONGOING',
          coverUrl,
          inLibrary: false,
          categoryId: null,
          totalChapters: 0,
          unreadCount: 0,
          downloadedCount: 0,
          lastChapterNumber: 0,
          lastReadChapterId: null,
          lastReadAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });

    return {
      manga,
      hasNextPage: manga.length >= 20,
      page,
      total: manga.length,
    };
  }

  async getMangaDetails(sourceMangaId) {
    const url = `${this.baseUrl}/series/${sourceMangaId}`;
    const res = await axios.get(url, { headers: this.headers });
    const $ = cheerio.load(res.data);

    const title = $('h1').first().text().trim() || sourceMangaId;
    const coverUrl = $('img[alt*="cover"], img.object-cover').first().attr('src') || '';
    const desc = $('p.description, section p').first().text().trim();

    return {
      id: `${this.id}:${sourceMangaId}`,
      sourceId: this.id,
      sourceMangaId,
      title,
      altTitles: [],
      description: desc,
      author: 'WeebCentral',
      artist: 'WeebCentral',
      genres: ['Manga', 'Manhwa'],
      status: 'ONGOING',
      coverUrl,
    };
  }

  async getChapterList(sourceMangaId) {
    const url = `${this.baseUrl}/series/${sourceMangaId}`;
    const res = await axios.get(url, { headers: this.headers });
    const $ = cheerio.load(res.data);
    const chapters = [];

    $('a[href*="/chapters/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const parts = href.split('/');
      const chId = parts[2] || parts[4] || href.replace('/chapters/', '');
      const rawTitle = $(el).text().replace(/\s+/g, ' ').trim();

      const match = rawTitle.match(/(?:ch(?:apter)?\.?|\b)\s*([0-9]+(?:\.[0-9]+)?)/i);
      const chapterNumber = match ? parseFloat(match[1]) : 0;

      chapters.push({
        id: `${this.id}:${sourceMangaId}:${chId}`,
        mangaId: `${this.id}:${sourceMangaId}`,
        sourceId: this.id,
        sourceChapterId: chId,
        title: rawTitle || `Capítulo ${chapterNumber}`,
        chapterNumber,
        volume: null,
        releaseDate: null,
        scanlator: 'WeebCentral',
        url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
        isRead: false,
        lastPageRead: 0,
        totalPages: 0,
        isDownloaded: false,
        downloadProgress: 0,
        downloadedPath: null,
      });
    });

    chapters.sort((a, b) => b.chapterNumber - a.chapterNumber);
    return chapters;
  }

  async getPageList(sourceChapterId) {
    const url = `${this.baseUrl}/chapters/${sourceChapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`;
    const res = await axios.get(url, { headers: this.headers });
    const $ = cheerio.load(res.data);
    const pages = [];

    $('img').each((i, el) => {
      const src = $(el).attr('src');
      if (src && !src.includes('placeholder')) {
        pages.push({
          index: i + 1,
          url: src,
          headers: {
            'Referer': this.baseUrl,
            'User-Agent': this.headers['User-Agent'],
          },
        });
      }
    });

    return pages;
  }
}

module.exports = WeebCentralSource;
