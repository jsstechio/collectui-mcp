import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as cheerio from 'cheerio';

const BASE = 'https://collectui.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Cache categories for 1 hour
let cachedCategories = null;
let categoriesCachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000;

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
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

    // Try to extract count from text like "Landing Page (1825)"
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

    // Build large image URL from medium
    const largeUrl = src.replace(/-medium(\.\w+)?$/, '-large$1').replace(/-medium$/, '-large');

    // Find designer nearby
    let designer = '';
    const card = $(el).closest('div, li, article');
    const designerLink = card.find('a[href^="/designers/"]');
    if (designerLink.length) {
      designer = designerLink.text().trim();
    }

    // Find category nearby
    let category = '';
    const categoryLink = card.find('a[href^="/challenges/"]');
    if (categoryLink.length) {
      category = categoryLink.text().trim();
    }

    const detailUrl = detailHref.startsWith('http') ? detailHref
      : detailHref.startsWith('/') ? `${BASE}${detailHref}`
      : '';

    designs.push({
      imageUrl: src,
      largeImageUrl: largeUrl,
      designer: designer || alt,
      category,
      detailUrl,
    });
  });

  return designs;
}

async function getCategories() {
  const now = Date.now();
  if (cachedCategories && now - categoriesCachedAt < CACHE_TTL) {
    return cachedCategories;
  }
  const html = await fetchPage(BASE);
  cachedCategories = parseCategories(html);
  categoriesCachedAt = now;
  return cachedCategories;
}

function matchCategories(query, categories) {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  return categories.filter(c => {
    const name = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const slug = c.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    return name.includes(q) || slug.includes(q) || q.includes(name) || q.includes(slug);
  });
}

export function createServer() {
  const server = new McpServer({
    name: 'collectui-mcp',
    version: '1.0.0',
  });

  // Tool 1: List categories
  server.tool(
    'collectui_categories',
    'List all Collect UI design challenge categories (167 categories, 14,400+ curated designs)',
    {},
    async () => {
      const categories = await getCategories();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(categories, null, 2),
        }],
      };
    }
  );

  // Tool 2: Browse a category
  server.tool(
    'collectui_browse',
    'Browse a Collect UI category and get design inspiration images. Returns image URLs that can be analyzed visually for color palettes, typography, and layout patterns.',
    {
      category: z.string().describe('Category slug (e.g., "landing-page", "monitoring-dashboard", "checkout")'),
      sort: z.enum(['popular', 'newest']).default('popular').describe('Sort order'),
      limit: z.number().min(1).max(50).default(12).describe('Max number of designs to return'),
    },
    async ({ category, sort, limit }) => {
      const url = `${BASE}/challenges/${category}?sortBy=${sort === 'popular' ? 'popularity' : 'newest'}`;
      const html = await fetchPage(url);
      const designs = parseDesigns(html, limit);

      if (designs.length === 0) {
        return {
          content: [{ type: 'text', text: `No designs found for category "${category}". Use collectui_categories to see available categories.` }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            category,
            sort,
            count: designs.length,
            designs,
          }, null, 2),
        }],
      };
    }
  );

  // Tool 3: Search across categories
  server.tool(
    'collectui_search',
    'Search Collect UI for design inspiration by keyword. Finds matching categories and returns top designs from each. Use for domain research (e.g., "dashboard", "e-commerce", "onboarding").',
    {
      query: z.string().describe('Search keyword (e.g., "dashboard", "landing page", "checkout", "music")'),
      limit: z.number().min(1).max(50).default(12).describe('Max total designs to return'),
    },
    async ({ query, limit }) => {
      const categories = await getCategories();
      const matches = matchCategories(query, categories);

      if (matches.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No categories match "${query}". Try broader terms. Available: ${categories.slice(0, 20).map(c => c.slug).join(', ')}...`,
          }],
        };
      }

      // Distribute limit across matching categories
      const perCategory = Math.max(3, Math.ceil(limit / matches.length));
      const allDesigns = [];

      for (const cat of matches.slice(0, 5)) {
        if (allDesigns.length >= limit) break;
        try {
          const url = `${BASE}/challenges/${cat.slug}?sortBy=popularity`;
          const html = await fetchPage(url);
          const designs = parseDesigns(html, perCategory);
          allDesigns.push(...designs.map(d => ({ ...d, matchedCategory: cat.name })));
        } catch (e) {
          // Skip failed categories
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            matchedCategories: matches.slice(0, 5).map(c => c.name),
            count: Math.min(allDesigns.length, limit),
            designs: allDesigns.slice(0, limit),
          }, null, 2),
        }],
      };
    }
  );

  // Start server
  const transport = new StdioServerTransport();
  server.connect(transport);
  console.error('collectui-mcp server running on stdio');
}
