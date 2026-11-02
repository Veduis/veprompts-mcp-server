import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import Fuse from 'fuse.js';
import matter from 'gray-matter';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Data resolution
 *
 * The canonical data lives in the VePrompts repository. When this server is
 * run from a clone of the repo (the default), data paths resolve relative to
 * the repository root. Set VEPROMPTS_DATA_DIR to point at any directory with
 * the same layout:
 *
 *   <dataDir>/static/search-index.json
 *   <dataDir>/src/lib/data/pricing/models.json
 *   <dataDir>/src/content/prompts/*.md
 *
 * When a local file is absent, the server falls back to the public JSON
 * endpoints on https://veprompts.com, so `npx -y @veprompts/mcp-server`
 * works outside the repository as long as the machine has network access.
 */
const SITE = 'https://veprompts.com';
function resolveDataDir() {
    if (process.env.VEPROMPTS_DATA_DIR) {
        return resolve(process.env.VEPROMPTS_DATA_DIR);
    }
    const here = fileURLToPath(new URL('.', import.meta.url));
    // dist/ -> veprompts-server/ -> mcp/ -> repo root
    return resolve(here, '..', '..', '..');
}
const dataDir = resolveDataDir();
function localPath(relativePath) {
    const fullPath = join(dataDir, relativePath);
    return existsSync(fullPath) ? fullPath : null;
}
async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }
    return (await res.json());
}
async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }
    return res.text();
}
// ---------------------------------------------------------------------------
// Lazy data loaders: local repository files first, public HTTPS endpoints as
// fallback. Everything is cached after the first successful load.
// ---------------------------------------------------------------------------
let searchIndexCache = null;
let fuseCache = null;
let pricingCache = null;
let mcpServersCache = null;
let comparePairsCache = null;
let frameworksCache = null;
let glossaryCache = null;
async function loadSearchIndex() {
    if (searchIndexCache)
        return searchIndexCache;
    const local = localPath('static/search-index.json');
    searchIndexCache = local
        ? JSON.parse(readFileSync(local, 'utf-8'))
        : await fetchJson(`${SITE}/search-index.json`);
    return searchIndexCache;
}
async function getFuse() {
    if (!fuseCache) {
        fuseCache = new Fuse(await loadSearchIndex(), {
            keys: [
                { name: 'title', weight: 0.6 },
                { name: 'description', weight: 0.25 },
                { name: 'tags', weight: 0.15 }
            ],
            threshold: 0.35,
            ignoreLocation: true
        });
    }
    return fuseCache;
}
async function loadPricing() {
    if (pricingCache)
        return pricingCache;
    const local = localPath('src/lib/data/pricing/models.json');
    pricingCache = local
        ? JSON.parse(readFileSync(local, 'utf-8'))
        : await fetchJson(`${SITE}/api/v1/pricing/`);
    return pricingCache;
}
async function loadMcpServers() {
    if (mcpServersCache)
        return mcpServersCache;
    const localDir = join(dataDir, 'src', 'content', 'mcp-servers');
    if (existsSync(localDir)) {
        mcpServersCache = readdirSync(localDir)
            .filter((f) => f.endsWith('.md'))
            .map((f) => {
            const { data } = matter(readFileSync(join(localDir, f), 'utf-8'));
            const slug = f.replace('.md', '');
            return {
                id: slug,
                name: data.name || slug,
                title: data.title || slug,
                description: data.description || '',
                author: data.author || '',
                authorUrl: data.authorUrl || '',
                repoUrl: data.repoUrl || '',
                npmPackage: data.npmPackage || null,
                pypiPackage: data.pypiPackage || null,
                official: !!data.official,
                featured: !!data.featured,
                category: data.category || '',
                subcategory: data.subcategory || '',
                tags: data.tags || [],
                language: data.language || '',
                license: data.license || '',
                stars: data.stars || 0,
                lastCommit: data.lastCommit || '',
                tools: data.tools || [],
                compatibility: data.compatibility || {
                    clients: [],
                    transport: [],
                    requiresAuth: false,
                    requiresApiKey: false
                },
                vepromptsUrl: `${SITE}/mcp/servers/${slug}/`
            };
        });
    }
    else {
        mcpServersCache = await fetchJson(`${SITE}/api/v1/mcp-servers/`);
    }
    return mcpServersCache;
}
async function loadComparePairs() {
    if (comparePairsCache)
        return comparePairsCache;
    comparePairsCache = await fetchJson(`${SITE}/api/v1/compare/`);
    return comparePairsCache;
}
async function loadFrameworks() {
    if (frameworksCache)
        return frameworksCache;
    frameworksCache = await fetchJson(`${SITE}/api/v1/frameworks/`);
    return frameworksCache;
}
async function loadGlossary() {
    if (glossaryCache)
        return glossaryCache;
    glossaryCache = await fetchJson(`${SITE}/api/v1/glossary/`);
    return glossaryCache;
}
function findPromptFile(slug) {
    const dir = join(dataDir, 'src', 'content', 'prompts');
    if (!existsSync(dir))
        return null;
    const direct = join(dir, `${slug}.md`);
    if (existsSync(direct))
        return direct;
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    const needle = slug.toLowerCase();
    const match = files.find((f) => f.toLowerCase() === `${needle}.md`);
    return match ? join(dir, match) : null;
}
function findSkillFile(slug) {
    const dir = join(dataDir, 'src', 'content', 'skills');
    if (!existsSync(dir))
        return null;
    const direct = join(dir, `${slug}.md`);
    if (existsSync(direct))
        return direct;
    const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
    const needle = slug.toLowerCase();
    const match = files.find((f) => f.toLowerCase() === `${needle}.md`);
    return match ? join(dir, match) : null;
}
function textResult(text, isError = false) {
    return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}
const server = new McpServer({
    name: 'veprompts',
    version: '1.1.0'
});
server.tool('veprompts_search', 'Search the VePrompts library of AI prompts, guides, tools, and MCP servers by keyword.', {
    query: z
        .string()
        .describe('Search query matched against prompt titles, descriptions, and tags.'),
    limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .default(10)
        .describe('Maximum number of results to return.')
}, async ({ query, limit }) => {
    const fuse = await getFuse();
    const results = fuse.search(query, { limit }).map((r) => ({
        title: r.item.title,
        description: r.item.description,
        url: `https://veprompts.com${r.item.url}`,
        type: r.item.type,
        tags: r.item.tags
    }));
    return textResult(results.length > 0
        ? JSON.stringify(results, null, 2)
        : `No VePrompts entries matched "${query}".`);
});
function lookupPricing(query, limit, pricingModels) {
    const q = query.toLowerCase();
    const scored = [];
    for (const model of pricingModels) {
        const idMatch = model.id.toLowerCase().includes(q);
        const nameMatch = model.name.toLowerCase().includes(q);
        const providerMatch = model.provider.toLowerCase().includes(q);
        if (!idMatch && !nameMatch && !providerMatch)
            continue;
        const score = (idMatch ? 0 : 10) + (nameMatch ? 0 : 5) + (providerMatch ? 1 : 0);
        scored.push({ score, model });
    }
    return scored
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map(({ model }) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        inputPerMillion: model.pricing.input,
        outputPerMillion: model.pricing.output,
        contextWindow: model.contextWindow ?? null,
        releaseDate: model.releaseDate ?? null,
        status: model.status ?? null
    }));
}
server.tool('veprompts_pricing_lookup', 'Look up current API pricing for AI models tracked by VePrompts. Matches model id, display name, or provider.', {
    query: z
        .string()
        .describe('Model id (e.g. "anthropic/claude-opus-5.5"), model name, or provider name.'),
    limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .default(5)
        .describe('Maximum number of matches to return.')
}, async ({ query, limit }) => {
    const results = lookupPricing(query, limit, await loadPricing());
    return textResult(results.length > 0
        ? JSON.stringify(results, null, 2)
        : `No pricing entries matched "${query}". Try a provider name (e.g. "Anthropic") or a model id.`);
});
server.tool('veprompts_get_prompt', 'Fetch a VePrompts prompt by slug: full frontmatter metadata plus the raw prompt template content.', {
    slug: z
        .string()
        .describe('Prompt slug, e.g. "2026-01-20-achievement-quantification-engine" (as used on veprompts.com).')
}, async ({ slug }) => {
    const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '');
    const filePath = findPromptFile(safeSlug);
    if (!filePath) {
        // Remote fallback: /api/prompts/{slug} serves the raw template body.
        try {
            const remote = await fetchJson(`${SITE}/api/prompts/${safeSlug}`);
            const payload = {
                slug: remote.slug,
                url: `${SITE}/${remote.slug}/`,
                frontmatter: { title: remote.title },
                content: remote.rawContent.trim()
            };
            return textResult(JSON.stringify(payload, null, 2));
        }
        catch {
            return textResult(`Prompt "${slug}" not found in the VePrompts library. Use veprompts_search to discover valid slugs.`, true);
        }
    }
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);
    const frontmatter = parsed.data;
    const payload = {
        slug: safeSlug,
        url: `https://veprompts.com/${safeSlug}/`,
        frontmatter,
        content: parsed.content.trim()
    };
    return textResult(JSON.stringify(payload, null, 2));
});
server.tool('veprompts_get_mcp_server', 'Fetch a VePrompts MCP server directory entry by slug: description, install metadata, exposed tools, and client compatibility.', {
    slug: z
        .string()
        .describe('MCP server slug, e.g. "github" (as used on veprompts.com/mcp/servers/{slug}/).')
}, async ({ slug }) => {
    const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '');
    const servers = await loadMcpServers();
    const entry = servers.find((s) => s.id === safeSlug);
    if (!entry) {
        return textResult(`MCP server "${slug}" not found. Use veprompts_search with type "mcp" to discover valid slugs.`, true);
    }
    return textResult(JSON.stringify(entry, null, 2));
});
server.tool('veprompts_get_skill', 'Fetch a VePrompts agent skill by slug: skill instructions plus any bundled resource files.', {
    slug: z
        .string()
        .describe('Skill slug, e.g. "3d-printing-optimizer" (as used on veprompts.com).')
}, async ({ slug }) => {
    const safeSlug = slug.replace(/[^a-zA-Z0-9-_]/g, '');
    const filePath = findSkillFile(safeSlug);
    if (filePath) {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = matter(raw);
        const data = parsed.data;
        const payload = {
            slug: safeSlug,
            name: data.name ?? safeSlug,
            description: data.description ?? '',
            skillContent: parsed.content.trim(),
            resources: []
        };
        return textResult(JSON.stringify(payload, null, 2));
    }
    try {
        const remote = await fetchJson(`${SITE}/api/skills/${safeSlug}`);
        return textResult(JSON.stringify(remote, null, 2));
    }
    catch {
        return textResult(`Skill "${slug}" not found in the VePrompts library. Use veprompts_search with type "skill" to discover valid slugs.`, true);
    }
});
server.tool('veprompts_compare', 'Fetch a curated VePrompts comparison (X vs Y) by slug or entity name: verdict, when to pick each option, and FAQs.', {
    query: z
        .string()
        .describe('Comparison slug (e.g. "claude-code-vs-github-copilot") or an entity name.')
}, async ({ query }) => {
    const pairs = await loadComparePairs();
    const q = query.toLowerCase();
    const match = pairs.find((p) => p.slug.toLowerCase() === q ||
        p.entityA.toLowerCase() === q ||
        p.entityB.toLowerCase() === q);
    if (!match) {
        const partial = pairs.filter((p) => p.slug.toLowerCase().includes(q) ||
            p.entityA.toLowerCase().includes(q) ||
            p.entityB.toLowerCase().includes(q));
        if (partial.length === 0) {
            return textResult(`No curated comparison matched "${query}".`, true);
        }
        return textResult(`No exact match for "${query}". Similar comparisons:\n${partial
            .slice(0, 10)
            .map((p) => `- ${p.slug}: ${p.url}`)
            .join('\n')}`);
    }
    return textResult(JSON.stringify(match, null, 2));
});
server.tool('veprompts_get_framework', 'Fetch a VePrompts agent framework profile by slug or name: tagline, language, license, pricing, and feature flags.', {
    query: z.string().describe('Framework slug or name, e.g. "crewai" or "CrewAI".')
}, async ({ query }) => {
    const frameworks = await loadFrameworks();
    const q = query.toLowerCase();
    const match = frameworks.find((f) => f.slug.toLowerCase() === q || f.name.toLowerCase() === q);
    if (!match) {
        const partial = frameworks.filter((f) => f.slug.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
        if (partial.length === 0) {
            return textResult(`No agent framework matched "${query}".`, true);
        }
        return textResult(`No exact match for "${query}". Similar frameworks:\n${partial
            .slice(0, 10)
            .map((f) => `- ${f.slug}: ${f.url}`)
            .join('\n')}`);
    }
    return textResult(JSON.stringify(match, null, 2));
});
server.tool('veprompts_get_glossary', 'Fetch a VePrompts glossary term definition by slug or term name.', {
    query: z.string().describe('Glossary term or slug, e.g. "context window" or "context-window".')
}, async ({ query }) => {
    const terms = await loadGlossary();
    const q = query.toLowerCase();
    const match = terms.find((t) => t.slug.toLowerCase() === q || t.term.toLowerCase() === q);
    if (!match) {
        const partial = terms.filter((t) => t.slug.toLowerCase().includes(q) || t.term.toLowerCase().includes(q));
        if (partial.length === 0) {
            return textResult(`No glossary term matched "${query}".`, true);
        }
        return textResult(`No exact match for "${query}". Similar terms:\n${partial
            .slice(0, 10)
            .map((t) => `- ${t.slug}: ${t.url}`)
            .join('\n')}`);
    }
    return textResult(JSON.stringify(match, null, 2));
});
// ---------------------------------------------------------------------------
// MCP resources: read-only views over the same public endpoints.
// ---------------------------------------------------------------------------
server.registerResource('llms-full', 'veprompts://llms-full', {
    description: `Full machine-readable index of every VePrompts page (${SITE}/llms-full.txt).`,
    mimeType: 'text/plain'
}, async (uri) => ({
    contents: [{ uri: uri.href, text: await fetchText(`${SITE}/llms-full.txt`) }]
}));
server.registerResource('pricing', 'veprompts://pricing', {
    description: `Full LLM pricing dataset (per-1M-token input/output) from ${SITE}/api/v1/pricing/.`,
    mimeType: 'application/json'
}, async (uri) => ({
    contents: [
        { uri: uri.href, text: JSON.stringify(await loadPricing(), null, 2), mimeType: 'application/json' }
    ]
}));
server.registerResource('mcp-servers', 'veprompts://mcp-servers', {
    description: `Full MCP server directory catalog from ${SITE}/api/v1/mcp-servers/.`,
    mimeType: 'application/json'
}, async (uri) => ({
    contents: [
        {
            uri: uri.href,
            text: JSON.stringify(await loadMcpServers(), null, 2),
            mimeType: 'application/json'
        }
    ]
}));
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`veprompts-mcp-server running on stdio (data: ${dataDir})`);
}
main().catch((error) => {
    console.error('Fatal error in veprompts-mcp-server:', error);
    process.exit(1);
});
