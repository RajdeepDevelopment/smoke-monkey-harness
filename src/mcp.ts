/**
 * MCP stock catalog — a curated, self-hosting set of well-known MCP servers,
 * categorized for the sub-context panel's "STOCK MCP ACTIVATION" roadmap.
 *
 * The catalog is READ-ONLY guidance: none of these servers are started unless
 * the user configures one (via AgentOptions.mcp or addServer()). `flattenStock`
 * powers the activation panel; `stockToMcpConfig` turns an entry into a
 * ready-to-register server config for the manager.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { McpServerConfig } from './services/mcp-manager.js';

export interface StockEntry {
  name: string;
  label: string;
  description: string;
  category: string;
  command?: string;
  args?: string[];
  /** HTTP-transport servers: remote endpoint URL. */
  url?: string;
  envKeys?: string[];
  manualOAuth?: boolean;
  remote?: boolean;
  keyGetUrl?: string;
  keyGetLabel?: string;
  /** Human-readable one-liner on how to run it (start/install command). */
  dependency?: string;
  /** Bundled server that ships inside the package (e.g. `plugin/agent-skills/mcp/server.mjs`). */
  bundled?: { specifier: string; args?: string[] };
}

interface StockEntrySpec {
  name: string;
  label: string;
  description: string;
  category: string;
  command?: string;
  args?: string[];
  url?: string;
  envKeys?: string[];
  manualOAuth?: boolean;
  remote?: boolean;
  keyGetUrl?: string;
  keyGetLabel?: string;
  bundled?: { specifier: string; args?: string[] };
}

function entry(e: StockEntrySpec, _url2: string | null): StockEntry {
  const url = e.url ?? _url2 ?? undefined;
  return {
    name: e.name,
    label: e.label,
    description: e.description,
    category: e.category,
    command: e.bundled ? 'node' : url ? undefined : (e.command ?? 'npx'),
    args: e.bundled ? undefined : url ? undefined : (e.args ?? [`-y`, e.command ?? `@modelcontextprotocol/server-${e.name}`]),
    url,
    envKeys: e.envKeys ?? [],
    manualOAuth: e.manualOAuth ?? false,
    remote: e.remote ?? false,
    keyGetUrl: e.keyGetUrl,
    keyGetLabel: e.keyGetLabel ?? (e.envKeys && e.envKeys.length > 0 ? `Get ${e.envKeys[0]}` : undefined),
    dependency: e.bundled
      ? `Bundled — runs in-process with the package (no install needed)`
      : url
        ? `Remote · ${url}`
        : (e.command ?? 'npx') + ' ' + (e.args ?? []).join(' '),
    bundled: e.bundled,
  };
}

const STOCK: Array<[StockEntrySpec, string | null]> = [
  // Code & Git
  [{ name: 'filesystem-mcp', label: 'Filesystem', description: 'Read/write/search local files with sandboxed access controls — activate for file operations outside the default toolset.', category: 'Code & Git', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], envKeys: [] }, null],
  [{ name: 'github-mcp-server', label: 'GitHub', description: 'Repos, issues, PRs, actions, code search — activate when working with GitHub.', category: 'Code & Git', command: 'npx', args: ['-y', 'github-mcp-server'], envKeys: ['GITHUB_TOKEN'], keyGetUrl: 'https://github.com/settings/tokens', keyGetLabel: 'Get GITHUB_TOKEN' }, null],
  [{ name: 'git-mcp', label: 'Git', description: 'Advanced git operations: branches, remotes, merge trees — activate for complex git work.', category: 'Code & Git', command: 'npx', args: ['-y', 'git-mcp'], envKeys: [] }, null],
  [{ name: 'context7', label: 'Context7', description: 'Up-to-date library docs for 5000+ SDKs — activate when a dependency version/API is unclear.', category: 'Code & Git', command: 'npx', args: ['-y', '@upstash/context7-mcp'], envKeys: ['CONTEXT7_API_KEY'], keyGetUrl: 'https://context7.com', keyGetLabel: 'Get CONTEXT7_API_KEY' }, null],
  // Frontend & UI
  [{ name: 'shadcn', label: 'shadcn/ui', description: 'Add shadcn/ui registry components from a skeleton project — activate for shadcn/ui work.', category: 'Frontend & UI', command: 'npx', args: ['-y', 'shadcn@latest', 'mcp'], envKeys: [] }, null],
  [{ name: 'magicui', label: 'Magic UI', description: 'Magic UI animated components — activate when adding polished UI blocks.', category: 'Frontend & UI', command: 'npx', args: ['-y', 'magicui-mcp'], envKeys: [] }, null],
  // Web & Scraping
  [{ name: 'playwright-mcp', label: 'Playwright', description: 'Browser E2E: navigate, click, type, screenshot — activate to verify UI end-to-end.', category: 'Web & Scraping', command: 'npx', args: ['-y', '@playwright/mcp@latest'], envKeys: [] }, null],
  [{ name: 'chrome-devtools', label: 'Chrome DevTools', description: 'Drive Chrome over the DevTools protocol: inspect DOM, execute JS — activate for browser debugging.', category: 'Web & Scraping', command: 'npx', args: ['-y', 'chrome-devtools-mcp'], envKeys: [] }, null],
  [{ name: 'tavily-mcp', label: 'Tavily Search', description: 'Fast AI-native web search with fresh structured results — activate when the task needs current web data.', category: 'Web & Scraping', command: 'npx', args: ['-y', 'tavily-mcp@latest'], envKeys: ['TAVILY_API_KEY'], keyGetUrl: 'https://app.tavily.com', keyGetLabel: 'Get TAVILY_API_KEY' }, null],
  [{ name: 'mcp-server-firecrawl', label: 'Firecrawl', description: 'Scrape, crawl and search the web for AI agents — activate when extracting site data at scale.', category: 'Web & Scraping', command: 'npx', args: ['-y', 'firecrawl-mcp'], envKeys: ['FIRECRAWL_API_KEY'], keyGetUrl: 'https://firecrawl.dev', keyGetLabel: 'Get FIRECRAWL_API_KEY' }, null],
  [{ name: 'mcp-exa', label: 'Exa', description: 'Semantic web/search and neural retrieval — activate for research-grade lookups.', category: 'Web & Scraping', command: 'npx', args: ['-y', 'exa-mcp-server'], envKeys: ['EXA_API_KEY'], keyGetUrl: 'https://exa.ai', keyGetLabel: 'Get EXA_API_KEY' }, null],
  // Databases & Storage
  [{ name: 'postgres-mcp-server', label: 'PostgreSQL', description: 'Run PostgreSQL SQL, inspect schema, indexes, EXPLAIN — activate for Postgres work.', category: 'Databases & Storage', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'], envKeys: [] }, null],
  [{ name: 'sqlite', label: 'SQLite', description: 'Local SQLite file querying — activate for small local databases.', category: 'Databases & Storage', command: 'npx', args: ['-y', '@socketkit/sqlite-mcp'], envKeys: [] }, null],
  [{ name: 'redis-mcp-server', label: 'Redis', description: 'Inspect and operate Redis cache/queues — activate for cache and queue systems.', category: 'Databases & Storage', command: 'npx', args: ['-y', 'redis-mcp'], envKeys: [] }, null],
  [{ name: 'mongodb-mcp-server', label: 'MongoDB', description: 'Query and manage MongoDB collections — activate for document databases.', category: 'Databases & Storage', command: 'npx', args: ['-y', 'mongodb-mcp-server'], envKeys: [] }, null],
  // Observability & Dev Tools
  [{ name: 'sentry-mcp-server', label: 'Sentry', description: 'Error triage: issues, stack traces, releases — activate when debugging production errors.', category: 'Observability & Dev Tools', command: 'npx', args: ['-y', 'sentry-mcp@latest'], envKeys: ['SENTRY_AUTH_TOKEN'], keyGetUrl: 'https://sentry.io/settings/account/api/auth-tokens/', keyGetLabel: 'Get SENTRY_AUTH_TOKEN' }, null],
  [{ name: 'prometheus', label: 'Prometheus', description: 'PromQL metrics queries — activate for monitoring/alerting work.', category: 'Observability & Dev Tools', command: 'npx', args: ['-y', 'mcp-prometheus'], envKeys: [] }, null],
  [{ name: 'postman', label: 'Postman', description: 'API test suites and collections — activate for API validation work.', category: 'Observability & Dev Tools', command: 'npx', args: ['-y', 'postman-mcp-server'], envKeys: ['POSTMAN_API_KEY'], keyGetUrl: 'https://web.postman.co/settings/me/api-keys', keyGetLabel: 'Get POSTMAN_API_KEY' }, null],
  // AI & Vector Search
  [{ name: 'qdrant-mcp', label: 'Qdrant', description: 'Vector search / RAG collections — activate for similarity and embedding work.', category: 'AI & Vector Search', command: 'npx', args: ['-y', 'mcp-server-qdrant'], envKeys: ['QDRANT_URL', 'QDRANT_API_KEY'], keyGetUrl: 'https://cloud.qdrant.io', keyGetLabel: 'Get QDRANT_URL + API_KEY' }, null],
  [{ name: 'memory-mcp', label: 'Memory', description: 'Persistent knowledge graph memory — activate when the task must remember facts across turns.', category: 'AI & Vector Search', command: 'npx', args: ['-y', 'memory-mcp'], envKeys: [] }, null],
  // Communication & Productivity
  [{ name: 'notion-mcp-server', label: 'Notion', description: 'Read/write Notion pages and databases — activate for docs/notes.', category: 'Communication & Productivity', command: 'npx', args: ['-y', 'notion-mcp-server'], envKeys: ['NOTION_TOKEN'], keyGetUrl: 'https://developers.notion.com', keyGetLabel: 'Get NOTION_TOKEN' }, null],
  [{ name: 'slack-mcp-server', label: 'Slack', description: 'Post to channels, read messages, search — activate for team chat work.', category: 'Communication & Productivity', command: 'npx', args: ['-y', 'slack-mcp-server'], envKeys: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'], keyGetUrl: 'https://api.slack.com/apps', keyGetLabel: 'Get SLACK_BOT_TOKEN' }, null],
  [{ name: 'jira-mcp-server', label: 'Jira', description: 'JQL queries, tickets, sprints — activate for issue tracking.', category: 'Communication & Productivity', command: 'npx', args: ['-y', 'jira-mcp-server'], envKeys: ['JIRA_API_TOKEN', 'JIRA_URL', 'JIRA_USER_EMAIL'], keyGetUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens', keyGetLabel: 'Get JIRA_API_TOKEN' }, null],
  [{ name: 'linear-mcp-server', label: 'Linear', description: 'Create, update, query Linear issues — activate for issue tracking.', category: 'Communication & Productivity', command: 'npx', args: ['-y', 'linear-mcp-server'], envKeys: ['LINEAR_API_KEY'], keyGetUrl: 'https://linear.app/settings/api', keyGetLabel: 'Get LINEAR_API_KEY' }, null],
  // Cloudflare, Hosting & Backend
  [{ name: 'cloudflare-api', label: 'Cloudflare', description: 'DNS, Workers, R2, Zero Trust — activate when managing Cloudflare resources.', category: 'Cloudflare', command: 'npx', args: ['-y', 'cloudflare-mcp'], envKeys: ['CLOUDFLARE_API_TOKEN'], keyGetUrl: 'https://dash.cloudflare.com/profile/api-tokens', keyGetLabel: 'Get CLOUDFLARE_API_TOKEN' }, null],
  [{ name: 'firebase', label: 'Firebase', description: 'Auth, Firestore, Storage, functions — activate for Firebase work.', category: 'Hosting & Backend', command: 'npx', args: ['-y', 'firebase-mcp-server'], envKeys: ['FIREBASE_CREDENTIAL_KEY'], keyGetLabel: 'Get FIREBASE_CREDENTIAL_KEY' }, null],
  [{ name: 'neon', label: 'Neon', description: 'Neon Postgres branches, connect strings — activate for serverless Postgres.', category: 'Hosting & Backend', command: 'npx', args: ['-y', 'neon-mcp-server'], envKeys: ['NEON_API_KEY'], keyGetUrl: 'https://console.neon.tech', keyGetLabel: 'Get NEON_API_KEY' }, null],
  // Whiteboards & Flowcharts
  [{ name: 'excalidraw', label: 'Excalidraw', description: 'Whiteboard scenes from Mermaid syntax with live preview — activate when sketching hand-drawn diagrams.', category: 'Whiteboards & Flowcharts', command: 'npx', args: ['-y', 'mcp-excalidraw'], envKeys: [] }, null],
  [{ name: 'mermaid', label: 'Mermaid', description: 'Flowcharts, sequence, gantt, class, state diagrams from markdown — activate when diagramming in markdown.', category: 'Whiteboards & Flowcharts', command: 'npx', args: ['-y', 'mcp-mermaid@latest'], envKeys: [] }, null],
  [{ name: 'plantuml', label: 'PlantUML', description: 'UML sequence, class, activity diagrams from simple text — activate when creating UML.', category: 'Whiteboards & Flowcharts', command: 'npx', args: ['-y', 'plantuml-mcp-server'], envKeys: [] }, null],
  [{ name: 'drawio', label: 'draw.io', description: 'Create and manage draw.io diagrams via mxGraph — activate when editing draw.io files.', category: 'Whiteboards & Flowcharts', command: 'npx', args: ['-y', 'drawio-mcp-server'], envKeys: [] }, null],
  [{ name: 'miro', label: 'Miro Whiteboards', description: 'Read/write Miro boards via OAuth — activate when collaborating on a board.', category: 'Whiteboards & Flowcharts', remote: true, manualOAuth: true, envKeys: [] }, 'https://mcp.miro.com/'],
  // Search & Research
  [{ name: 'tavily', label: 'Tavily', description: 'Fresh web data via Tavily — activate for current web research.', category: 'Search & Research', command: 'npx', args: ['-y', 'tavily-mcp@latest'], envKeys: ['TAVILY_API_KEY'], keyGetUrl: 'https://app.tavily.com', keyGetLabel: 'Get TAVILY_API_KEY' }, null],
  [{ name: 'arxiv', label: 'Arxiv', description: 'Paper search and abstracts — activate for academic research.', category: 'Search & Research', command: 'npx', args: ['-y', 'arxiv-mcp-server'], envKeys: [] }, null],
  // Agent Skills (bundled — the 25 production-engineering SKILL.md bundles,
  // served over MCP by the dependency-free server shipped in plugin/agent-skills)
  [{ name: 'agent-skills-backend', label: 'Agent Skills · Backend', description: 'Bundled backend engineering skills (API design, TDD, security, performance) served over MCP — activate for backend work.', category: 'Agent Skills', bundled: { specifier: 'smoke-monkey-harness/plugin/agent-skills/mcp/server.mjs', args: ['--domain=backend'] } }, null],
  [{ name: 'agent-skills-frontend', label: 'Agent Skills · Frontend', description: 'Bundled frontend engineering skills (UI engineering, accessibility, browser testing) served over MCP — activate for frontend work.', category: 'Agent Skills', bundled: { specifier: 'smoke-monkey-harness/plugin/agent-skills/mcp/server.mjs', args: ['--domain=frontend'] } }, null],
  [{ name: 'agent-skills-devops', label: 'Agent Skills · DevOps', description: 'Bundled DevOps skills (CI/CD, observability, git workflow, shipping) served over MCP — activate for ops/release work.', category: 'Agent Skills', bundled: { specifier: 'smoke-monkey-harness/plugin/agent-skills/mcp/server.mjs', args: ['--domain=devops'] } }, null],
  [{ name: 'agent-skills-qa', label: 'Agent Skills · QA', description: 'Bundled QA skills (test-driven development, debugging, verification) served over MCP — activate for testing/QA work.', category: 'Agent Skills', bundled: { specifier: 'smoke-monkey-harness/plugin/agent-skills/mcp/server.mjs', args: ['--domain=qa'] } }, null],
];

function build(): StockEntry[] {
  return STOCK.map(([spec, url2]) => entry(spec, url2));
}

const FLATTENED = build();

export function listStockCategories(): string[] {
  return Array.from(new Set(FLATTENED.map((e) => e.category)));
}

export function countStock(): number {
  return FLATTENED.length;
}

export function flattenStock(): StockEntry[] {
  return FLATTENED;
}

export function findStockEntry(name: string): StockEntry | undefined {
  const key = name.toLowerCase();
  return FLATTENED.find((e) => e.name.toLowerCase() === key || e.label.toLowerCase() === key);
}

/**
 * Turn a stock entry into a runnable McpServerConfig a user can hand to
 * AgentOptions.mcp (or addServer()). Key-based servers still need their
 * key/URL wired via `env` before the server will function.
 */
export function stockToMcpConfig(
  entryLike: StockEntry,
  opts: { env?: Record<string, string>; headers?: Record<string, string>; enabled?: boolean } = {},
): McpServerConfig {
  if (entryLike.bundled) {
    return {
      id: entryLike.name.toLowerCase(),
      name: entryLike.name,
      description: `${entryLike.label} — ${entryLike.description}`,
      command: process.execPath,
      args: [resolveBundledServer(entryLike.bundled.specifier), ...(entryLike.bundled.args ?? [])],
      env: opts.env,
      headers: opts.headers,
      enabled: opts.enabled,
    };
  }
  return {
    id: entryLike.name.toLowerCase(),
    name: entryLike.name,
    description: `${entryLike.label} — ${entryLike.description}`,
    command: entryLike.url ? undefined : entryLike.command,
    args: entryLike.url ? undefined : entryLike.args,
    url: entryLike.url,
    env: opts.env,
    headers: opts.headers,
    enabled: opts.enabled,
  };
}

/**
 * Resolve a bundled server subpath (e.g. `smoke-monkey-harness/plugin/agent-skills/mcp/server.mjs`)
 * to an absolute file path. Uses `createRequire` anchored at the caller's cwd so the
 * resolution walks node_modules from the user's project — and self-references the package
 * `exports` map when running inside a link/dev checkout. Works in both the ESM and CJS builds
 * (no `import.meta` dependency).
 */
function resolveBundledServer(specifier: string): string {
  const requireFromCwd = createRequire(join(process.cwd(), '__smoke_monkey_resolve__.js'));
  try {
    return requireFromCwd.resolve(specifier);
  } catch (err) {
    throw new Error(
      `stockToMcpConfig: bundled server "${specifier}" could not be resolved from ${process.cwd()} — ` +
        `ensure smoke-monkey-harness is installed in this project's node_modules.`,
      { cause: err },
    );
  }
}