import * as cheerio from 'cheerio';

const BASE = 'https://fontsinuse.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default {
  name: 'Fonts In Use',
  slug: 'fontsinuse',

  async search(query, limit) {
    // Fonts In Use has a filter page
    const url = query && query !== 'design' && query !== 'fonts'
      ? `${BASE}/?search=${encodeURIComponent(query)}`
      : `${BASE}/?filters=staff-picks-only`;

    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const designs = [];

    // Fonts In Use uses images from their CDN
    $('img[src*="assets.fontsinuse.com"], img[src*="/use-media-items/"]').each((_, el) => {
      if (designs.length >= limit) return false;
      let src = $(el).attr('src') || '';
      if (src.startsWith('/')) src = `${BASE}${src}`;
      if (!src.startsWith('http')) return;

      const alt = $(el).attr('alt') || '';

      // Skip tiny images
      const width = parseInt($(el).attr('width') || '0', 10);
      if (width > 0 && width < 50) return;

      const parent = $(el).closest('a');
      const href = parent.attr('href') || '';
      const sourceUrl = href.startsWith('http') ? href
        : href.startsWith('/') ? `${BASE}${href}` : '';

      const card = $(el).closest('div, li, article, .use');
      const title = card.find('h2, h3, .title, .use-title').first().text().trim()
        || alt || 'Fonts In Use';

      designs.push({
        imageUrl: src,
        title: title.slice(0, 100),
        source: 'Fonts In Use',
        sourceUrl,
      });
    });

    return designs.slice(0, limit);
  },
};
