import * as cheerio from 'cheerio';

const BASE = 'https://brutalistwebsites.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default {
  name: 'Brutalist Websites',
  slug: 'brutalist',

  async search(query, limit) {
    const res = await fetch(BASE, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const designs = [];

    // Brutalist Websites uses img tags with _img/ path
    $('img[src*="_img/"]').each((_, el) => {
      if (designs.length >= limit * 3) return false; // grab extra for filtering
      let src = $(el).attr('src') || '';
      if (src.startsWith('/')) src = `${BASE}${src}`;
      if (!src.startsWith('http')) src = `${BASE}/${src}`;

      const alt = $(el).attr('alt') || '';
      const parent = $(el).closest('a');
      const href = parent.attr('href') || '';

      // Get the website URL (brutalist lists link to the actual websites)
      const sourceUrl = href.startsWith('http') ? href : '';

      // Find title from sibling or parent text
      const card = $(el).closest('div, li, section');
      const title = card.find('h2, h3, .title, p').first().text().trim()
        || alt || 'Brutalist Design';

      designs.push({
        imageUrl: src,
        title: title.slice(0, 100), // Truncate long titles
        source: 'Brutalist Websites',
        sourceUrl,
      });
    });

    // Filter by query keyword against title/url
    const q = query.toLowerCase();
    const filtered = designs.filter(d =>
      d.title.toLowerCase().includes(q)
      || d.sourceUrl.toLowerCase().includes(q)
      || q === 'design' || q === 'website' || q === 'brutalist'
    );

    return (filtered.length >= 2 ? filtered : designs).slice(0, limit);
  },
};
