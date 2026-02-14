import * as cheerio from 'cheerio';

const BASE = 'https://httpster.net';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default {
  name: 'Httpster',
  slug: 'httpster',

  async search(query, limit) {
    const res = await fetch(BASE, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const designs = [];

    $('img.Preview__img, img[class*="Preview"]').each((_, el) => {
      if (designs.length >= limit) return false;
      let src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (!src) return;

      // Make relative URLs absolute
      if (src.startsWith('/')) src = `${BASE}${src}`;

      const alt = $(el).attr('alt') || '';
      const parent = $(el).closest('a');
      const href = parent.attr('href') || '';
      const sourceUrl = href.startsWith('http') ? href
        : href.startsWith('/') ? `${BASE}${href}` : '';

      const card = $(el).closest('div, li, article');
      const title = card.find('h2, h3, .title, .name').first().text().trim()
        || alt || 'Httpster Design';

      designs.push({
        imageUrl: src,
        title,
        source: 'Httpster',
        sourceUrl,
      });
    });

    // Also try generic img tags in the main content area
    if (designs.length < limit) {
      $('img[src*="/assets/media/"]').each((_, el) => {
        if (designs.length >= limit) return false;
        let src = $(el).attr('src') || '';
        if (src.startsWith('/')) src = `${BASE}${src}`;
        if (designs.some(d => d.imageUrl === src)) return;

        designs.push({
          imageUrl: src,
          title: $(el).attr('alt') || 'Httpster Design',
          source: 'Httpster',
          sourceUrl: '',
        });
      });
    }

    return designs.slice(0, limit);
  },
};
