import * as cheerio from 'cheerio';

const BASE = 'https://godly.website';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default {
  name: 'Godly',
  slug: 'godly',

  async search(query, limit) {
    const res = await fetch(BASE, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const designs = [];

    // Godly uses background-image inline styles on div elements
    $('[style*="background-image"]').each((_, el) => {
      if (designs.length >= limit) return false;
      const style = $(el).attr('style') || '';
      const match = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
      if (!match) return;
      const imageUrl = match[1];
      if (!imageUrl.includes('cdn.godly.website')) return;

      // Try to find title and link from parent/sibling elements
      const parent = $(el).closest('a');
      const href = parent.attr('href') || '';
      const title = parent.find('h2, h3, span').first().text().trim()
        || parent.attr('title') || '';

      const sourceUrl = href.startsWith('http') ? href
        : href.startsWith('/') ? `${BASE}${href}` : '';

      designs.push({
        imageUrl,
        title: title || 'Godly Design',
        source: 'Godly',
        sourceUrl,
      });
    });

    // Also check for img tags with godly CDN
    if (designs.length < limit) {
      $('img[src*="cdn.godly.website"]').each((_, el) => {
        if (designs.length >= limit) return false;
        const imageUrl = $(el).attr('src') || '';
        const alt = $(el).attr('alt') || '';
        const parent = $(el).closest('a');
        const href = parent.attr('href') || '';
        const sourceUrl = href.startsWith('http') ? href
          : href.startsWith('/') ? `${BASE}${href}` : '';

        // Avoid duplicates
        if (designs.some(d => d.imageUrl === imageUrl)) return;

        designs.push({
          imageUrl,
          title: alt || 'Godly Design',
          source: 'Godly',
          sourceUrl,
        });
      });
    }

    // Filter by query if provided (match against title)
    const q = query.toLowerCase();
    const filtered = designs.filter(d =>
      d.title.toLowerCase().includes(q) || q === 'design' || q === 'website' || q === 'web'
    );

    // If query filtering gives too few results, return all
    return (filtered.length >= 2 ? filtered : designs).slice(0, limit);
  },
};
