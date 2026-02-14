import * as cheerio from 'cheerio';

const BASE = 'https://collectui.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let cachedCategories = null;
let categoriesCachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000;

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function parseCategories(html) {
  const $ = cheerio.load(html);
  const categories = [];
  $('a[href^="/challenges/"]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href || href === '/challenges') return;
    const slug = href.replace('/challenges/', '').split('?')[0];
    if (!slug || categories.some(c => c.slug === slug)) return;
    const match = text.match(/^(.+?)\s*\((\d+)\)\s*$/);
    const name = match ? match[1].trim() : text;
    const count = match ? parseInt(match[2], 10) : null;
    categories.push({ name, slug, count, url: `${BASE}/challenges/${slug}` });
  });
  return categories;
}

function parseDesigns(html, limit) {
  const $ = cheerio.load(html);
  const designs = [];
  $('img[src*="static.collectui.com/shots"]').each((i, el) => {
    if (designs.length >= limit) return false;
    const src = $(el).attr('src') || '';
    const alt = $(el).attr('alt') || '';
    const parent = $(el).closest('a');
    const detailHref = parent.attr('href') || '';
    const largeUrl = src.replace(/-medium(\.\w+)?$/, '-large$1').replace(/-medium$/, '-large');
    let designer = '';
    const card = $(el).closest('div, li, article');
    const designerLink = card.find('a[href^="/designers/"]');
    if (designerLink.length) designer = designerLink.text().trim();
    let category = '';
    const categoryLink = card.find('a[href^="/challenges/"]');
    if (categoryLink.length) category = categoryLink.text().trim();
    const detailUrl = detailHref.startsWith('http') ? detailHref
      : detailHref.startsWith('/') ? `${BASE}${detailHref}` : '';
    designs.push({
      imageUrl: largeUrl || src,
      title: alt || category || 'Untitled',
      source: 'Collect UI',
      sourceUrl: detailUrl,
      designer,
      category,
    });
  });
  return designs;
}

export async function getCategories() {
  const now = Date.now();
  if (cachedCategories && now - categoriesCachedAt < CACHE_TTL) {
    return cachedCategories;
  }
  const html = await fetchPage(BASE);
  cachedCategories = parseCategories(html);
  categoriesCachedAt = now;
  return cachedCategories;
}

export function matchCategories(query, categories) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  return categories.filter(c => {
    const name = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const slug = c.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    return name.includes(q) || slug.includes(q) || q.includes(name) || q.includes(slug);
  });
}

export async function browseCategory(category, sort, limit) {
  const url = `${BASE}/challenges/${category}?sortBy=${sort === 'popular' ? 'popularity' : 'newest'}`;
  const html = await fetchPage(url);
  return parseDesigns(html, limit);
}

export default {
  name: 'Collect UI',
  slug: 'collectui',
  async search(query, limit) {
    const categories = await getCategories();
    const matches = matchCategories(query, categories);
    if (matches.length === 0) return [];
    const perCategory = Math.max(3, Math.ceil(limit / matches.length));
    const all = [];
    for (const cat of matches.slice(0, 3)) {
      if (all.length >= limit) break;
      try {
        const url = `${BASE}/challenges/${cat.slug}?sortBy=popularity`;
        const html = await fetchPage(url);
        all.push(...parseDesigns(html, perCategory));
      } catch { /* skip */ }
    }
    return all.slice(0, limit);
  },
};
