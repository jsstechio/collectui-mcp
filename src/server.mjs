import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// Providers
import collectui, { getCategories, matchCategories, browseCategory } from './providers/collectui.mjs';
import godly from './providers/godly.mjs';
import landbook from './providers/landbook.mjs';
import httpster from './providers/httpster.mjs';
import brutalist from './providers/brutalist.mjs';
import fontsinuse from './providers/fontsinuse.mjs';

const ALL_PROVIDERS = [collectui, godly, landbook, httpster, brutalist, fontsinuse];
const PROVIDER_SLUGS = ALL_PROVIDERS.map(p => p.slug);

function interleave(arrays) {
  const result = [];
  const maxLen = Math.max(...arrays.map(a => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (i < arr.length) result.push(arr[i]);
    }
  }
  return result;
}

async function searchAll(query, limit, sources) {
  const providers = sources && sources.length > 0
    ? ALL_PROVIDERS.filter(p => sources.includes(p.slug))
    : ALL_PROVIDERS;

  const perProvider = Math.max(3, Math.ceil(limit / providers.length));

  const results = await Promise.allSettled(
    providers.map(p =>
      p.search(query, perProvider).catch(() => [])
    )
  );

  const arrays = results
    .filter(r => r.status === 'fulfilled' && r.value.length > 0)
    .map(r => r.value);

  const sourcesUsed = [...new Set(
    arrays.flat().map(d => d.source)
  )];

  return {
    designs: interleave(arrays).slice(0, limit),
    sourcesUsed,
  };
}

export function createServer() {
  const server = new McpServer({
    name: 'collectui-mcp',
    version: '1.1.0',
  });

  // Main tool: search all design sources
  server.tool(
    'design_search',
    `Search multiple design inspiration websites for UI/UX references. Searches ${ALL_PROVIDERS.map(p => p.name).join(', ')} in parallel. Returns image URLs for visual analysis.`,
    {
      query: z.string().describe('Search keyword (e.g., "dashboard", "landing page", "e-commerce", "coffee shop")'),
      limit: z.number().min(1).max(50).default(12).describe('Max total designs to return'),
      sources: z.array(z.enum(PROVIDER_SLUGS)).optional().describe(
        `Filter to specific sources. Available: ${PROVIDER_SLUGS.join(', ')}. Omit to search all.`
      ),
    },
    async ({ query, limit, sources }) => {
      const { designs, sourcesUsed } = await searchAll(query, limit, sources);

      if (designs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No designs found for "${query}". Try broader terms like "website", "dashboard", "landing page".`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            sources: sourcesUsed,
            count: designs.length,
            designs,
          }, null, 2),
        }],
      };
    }
  );

  // Backward-compatible: collectui_search now searches all sources
  server.tool(
    'collectui_search',
    'Search design inspiration across multiple sources (Collect UI, Godly, Land-book, Httpster, Brutalist, Fonts In Use). Backward-compatible alias for design_search.',
    {
      query: z.string().describe('Search keyword'),
      limit: z.number().min(1).max(50).default(12).describe('Max total designs'),
    },
    async ({ query, limit }) => {
      const { designs, sourcesUsed } = await searchAll(query, limit);

      if (designs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No designs found for "${query}". Try broader terms.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            sources: sourcesUsed,
            count: designs.length,
            designs,
          }, null, 2),
        }],
      };
    }
  );

  // Collect UI specific: list categories
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

  // Collect UI specific: browse a category
  server.tool(
    'collectui_browse',
    'Browse a Collect UI category for design screenshots. Returns image URLs for visual analysis.',
    {
      category: z.string().describe('Category slug (e.g., "landing-page", "monitoring-dashboard")'),
      sort: z.enum(['popular', 'newest']).default('popular').describe('Sort order'),
      limit: z.number().min(1).max(50).default(12).describe('Max designs'),
    },
    async ({ category, sort, limit }) => {
      const designs = await browseCategory(category, sort, limit);

      if (designs.length === 0) {
        return {
          content: [{ type: 'text', text: `No designs found for category "${category}".` }],
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ category, sort, count: designs.length, designs }, null, 2),
        }],
      };
    }
  );

  const transport = new StdioServerTransport();
  server.connect(transport);
  console.error('collectui-mcp v1.1.0 running on stdio (6 sources: Collect UI, Godly, Land-book, Httpster, Brutalist, Fonts In Use)');
}
