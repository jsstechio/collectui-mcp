import * as cheerio from 'cheerio';

const BASE = 'https://land-book.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default {
  name: 'Land-book',
  slug: 'landbook',

  async search(query, limit) {
    // Land-book supports search via query parameter
    const url = query && query !== 'design' && query !== 'website'
      ? `${BASE}/websites?q=${encodeURIComponent(query)}`
      : BASE;

    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const designs = [];

    $('img[src*="cdn.land-book.com"]').each((_, el) => {
      if (designs.length >= limit) return false;
      const imageUrl = $(el).attr('src') || '';
      const alt = $(el).attr('alt') || '';

      // Skip tiny images (icons, logos)
      const width = parseInt($(el).attr('width') || '0', 10);
      if (width > 0 && width < 100) return;

      // Find parent link
      const parent = $(el).closest('a');
      const href = parent.attr('href') || '';
      const sourceUrl = href.startsWith('http') ? href
        : href.startsWith('/') ? `${BASE}${href}` : '';

      // Find title from nearby elements
      const card = $(el).closest('div, li, article');
      const title = card.find('h2, h3, .title').first().text().trim()
        || alt || 'Land-book Design';

      designs.push({
        imageUrl,
        title,
        source: 'Land-book',
        sourceUrl,
      });
    });

    return designs.slice(0, limit);
  },
};
