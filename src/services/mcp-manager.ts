/**
 * MCP (Model Context Protocol) client + manager for the harness.
 *
 * Two transports are supported:
 *  - stdio: spawn `command args...`, speak JSON-RPC over stdin/stdout
 *    (lines). Used by local servers (npx -y @modelcontextprotocol/server-*).
 *  - streamable-HTTP: POST JSON-RPC to `url`, reading `application/json` or
 *    `text/event-stream` responses (used by remote servers, e.g. Google).
 *
 * Servers are connected LAZILY: `activateServer()` spawns/initializes and
 * fetches `tools/list`, caching the handle. `closeAll()` tears everything
 * down. No server is spawned until its `mcp_<id>` sub-context is activated
 * by the agent (or a tool call targets it).
 *
 * No OAuth flows are bundled — bring your own auth via `headers`/`env`
 * (e.g. an Authorization bearer or a token env var for the child process).
 */
import { spawn } from 'node:child_process';
import { Logger } from '../logger.js';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
}

export interface McpServerHandle {
  serverId: string;
  name: string;
  tools: McpToolDef[];
  callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult>;
  close(): void;
  closed: boolean;
}

export interface McpServerConfig {
  /** Stable unique id used for the `mcp_<id>` sub-context (fallback: slugized name). */
  id: string;
  /** Display name — also the `<name>__<tool>` dispatch prefix (lowercased). */
  name: string;
  /** Short description (shown in the sub-context panel / recommendations). */
  description: string;
  icon?: string | null;
  /** stdio transport: command to spawn (e.g. "npx"). */
  command?: string;
  /** stdio transport: command args (e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]). */
  args?: string[];
  /** stdio transport: working directory for the child process. */
  cwd?: string;
  /** stdio transport: extra env vars for the child process. */
  env?: Record<string, string>;
  /** streamable-HTTP transport: endpoint URL (e.g. https://mcp.googleapis.com/...). */
  url?: string;
  /** streamable-HTTP transport: request headers (e.g. Authorization). */
  headers?: Record<string, string>;
  /** When false, the server is disabled and must be enabled before use. */
  enabled?: boolean;
}

export interface McpRuntime {
  /** All configured server configs (name, id, icon, enabled). */
  configs: Array<{ id: string; name: string; description: string; icon: string | null; enabled: boolean }>;
  /** Server id → handle map (populated lazily on activation). */
  handles: Map<string, McpServerHandle>;
  /** Tool name → server id lookup (all tools of all activated servers). */
  toolServerMap: Map<string, string>;
  /** Lazy-connect a server (spawn/init + tools/list). Returns existing handle if already connected. */
  activateServer(serverId: string): Promise<McpServerHandle>;
  /** Close all open handles. */
  closeAll(): void;
}

let rpcId = 0;

// ── Shared helpers ───────────────────────────────────────────────────────────

const HTTP_ACCEPT = 'application/json, text/event-stream';

async function parseMcpResponse(res: Response): Promise<Record<string, unknown>> {
  const ct = res.headers.get('content-type') ?? 'application/json';
  if (ct.includes('text/event-stream')) {
    const text = await res.text();
    let lastData: string | null = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('data:')) lastData = line.slice(5).trim();
    }
    if (lastData) {
      try {
        return JSON.parse(lastData) as Record<string, unknown>;
      } catch {
        /* fall through to the error below */
      }
    }
    throw new Error('Empty or unparseable SSE response from MCP server');
  }
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.error as Record<string, unknown> | undefined)?.message ?? String(json);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return json;
}

/**
 * Expand the child process PATH so spawned MCP executables (npx, uvx, docker…)
 * resolve even when the host was launched from a shell whose PATH omits the
 * user's local bin dirs (e.g. ~/.local/bin installed by `curl | sh`, or nvm).
 */
function buildChildEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    '$HOME/.local/bin',
    '$HOME/.cargo/bin',
    '$HOME/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
    .map((p) => p.replace('$HOME', home))
    .filter(Boolean);

  const existing = (process.env.PATH || '').split(':').filter(Boolean);
  const merged = [...candidates, ...existing];
  const path = Array.from(new Set(merged)).join(':');

  return { ...process.env, ...env, PATH: path };
}

/** Gate a promise with a wall-clock timeout so a dead server can't hang a run. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP request timed out after ${ms}ms (${label})`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// ── Streamable-HTTP transport ────────────────────────────────────────────────

function createHttpClient(
  url: string,
  opts: { headers?: Record<string, string> },
  logger: Logger,
  requestTimeoutMs: number,
): Promise<McpServerHandle> {
  let sessionId: string | null = null;
  let closed = false;

  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const handle: McpServerHandle = {
    serverId: '',
    name: '',
    tools: [],
    closed: false,
    async callTool(toolName: string, toolArgs: Record<string, unknown>): Promise<McpToolResult> {
      return sendRequest('tools/call', { name: toolName, arguments: toolArgs }) as Promise<McpToolResult>;
    },
    close() {
      if (closed) return;
      closed = true;
      handle.closed = true;
      for (const p of pending.values()) p.reject(new Error('client closed'));
      pending.clear();
    },
  };

  async function sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = ++rpcId;
    const msg = { jsonrpc: '2.0', id, method, params };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: HTTP_ACCEPT,
      ...(opts.headers ?? {}),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const call = (async () => {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(msg) });
      const json = await parseMcpResponse(res);
      if ('error' in json && json.error) {
        const e = json.error as Record<string, unknown>;
        throw new Error(`MCP error ${e.code}: ${e.message}`);
      }
      const sid = res.headers.get('mcp-session-id');
      if (sid) sessionId = sid;
      return json.result;
    })();
    return withTimeout(call, requestTimeoutMs, `${method}`);
  }

  async function sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const msg = { jsonrpc: '2.0', method, params: params ?? {} };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: HTTP_ACCEPT,
      ...(opts.headers ?? {}),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    await fetch(url, { method: 'POST', headers, body: JSON.stringify(msg) }).catch((): undefined => undefined);
  }

  return (async () => {
    try {
      await sendRequest('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'smoke-monkey', version: '1.0.8' },
      });
      await sendNotification('notifications/initialized');
      const toolsResult = (await sendRequest('tools/list', {})) as Record<string, unknown>;
      const toolsList = (toolsResult.tools ?? []) as Array<Record<string, unknown>>;
      handle.tools = toolsList.map((t) => ({
        name: String(t.name ?? ''),
        description: String(t.description ?? ''),
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' },
      }));
      return handle;
    } catch (err) {
      handle.close();
      throw err;
    }
  })();
}

// ── stdio transport ──────────────────────────────────────────────────────────

function createStdioClient(
  command: string,
  args: string[],
  env: Record<string, string>,
  cwd: string | undefined,
  logger: Logger,
  requestTimeoutMs: number,
): Promise<McpServerHandle> {
  const fullEnv = buildChildEnv(env);
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: fullEnv,
    cwd,
    shell: false,
  });

  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const tt = new Map<number, NodeJS.Timeout>();
  let buffer = '';
  let closed = false;

  const rejectPendingAll = (e: Error) => {
    for (const p of pending.values()) p.reject(e);
    pending.clear();
    for (const t of tt.values()) clearTimeout(t);
    tt.clear();
  };

  const handle: McpServerHandle = {
    serverId: '',
    name: '',
    tools: [],
    closed: false,
    async callTool(toolName: string, toolArgs: Record<string, unknown>): Promise<McpToolResult> {
      return sendRequest('tools/call', { name: toolName, arguments: toolArgs }) as Promise<McpToolResult>;
    },
    close() {
      if (closed) return;
      closed = true;
      handle.closed = true;
      try { child.kill(); } catch {}
      rejectPendingAll(new Error('client closed'));
    },
  };

  function sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++rpcId;
      pending.set(id, { resolve, reject });
      tt.set(
        id,
        setTimeout(() => {
          pending.delete(id);
          tt.delete(id);
          reject(new Error(`MCP request timed out after ${requestTimeoutMs}ms (${method})`));
        }, requestTimeoutMs),
      );
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      try {
        child.stdin.write(msg + '\n');
      } catch (err) {
        const t = tt.get(id);
        if (t) clearTimeout(t);
        tt.delete(id);
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function sendNotification(method: string, params?: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {} });
    try { child.stdin.write(msg + '\n'); } catch {}
  }

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let nlIdx: number;
    while ((nlIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nlIdx).trim();
      buffer = buffer.slice(nlIdx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if ('id' in parsed && parsed.id != null) {
          const id = Number(parsed.id);
          const p = pending.get(id);
          const t = tt.get(id);
          if (p) {
            pending.delete(id);
            if (t) clearTimeout(t);
            tt.delete(id);
            if (parsed.error) {
              const errObj = parsed.error as Record<string, unknown>;
              p.reject(new Error(`MCP error ${errObj.code}: ${errObj.message}`));
            } else {
              p.resolve(parsed.result);
            }
          }
        }
      } catch {}
    }
  });

  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (d: string) => {
    logger.debug(`[MCP stderr] ${d.slice(0, 300)}`);
  });

  child.on('close', (code) => {
    closed = true;
    handle.closed = true;
    logger.debug(`[MCP] process exited code=${code}`);
    rejectPendingAll(new Error(`MCP process exited (${code})`));
  });

  child.on('error', (err) => {
    closed = true;
    handle.closed = true;
    logger.warn(`[MCP] spawn error: ${err.message}`);
    rejectPendingAll(err);
  });

  // Initialize and list tools, then return the connected handle.
  return (async () => {
    try {
      await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'smoke-monkey', version: '1.0.8' },
        });
      sendNotification('notifications/initialized');
      const toolsResult = (await sendRequest('tools/list', {})) as Record<string, unknown>;
      const toolsList = (toolsResult.tools ?? []) as Array<Record<string, unknown>>;
      handle.tools = toolsList.map((t) => ({
        name: String(t.name ?? ''),
        description: String(t.description ?? ''),
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object' },
      }));
      return handle;
    } catch (err) {
      handle.close();
      throw err;
    }
  })();
}

// ── Managed server registry ──────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Concrete McpRuntime. Configure servers via the constructor or `addServer()`.
 *
 *   const mcp = new McpManager();
 *   mcp.addServer({
 *     id: 'filesystem', name: 'filesystem-mcp',
 *     description: 'Local filesystem tools',
 *     command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 *   });
 */
export class McpManager implements McpRuntime {
  readonly configs: Array<{ id: string; name: string; description: string; icon: string | null; enabled: boolean }>;
  readonly handles: Map<string, McpServerHandle>;
  readonly toolServerMap: Map<string, string>;
  private readonly raw: Map<string, McpServerConfig>;
  private readonly logger: Logger;
  private readonly requestTimeoutMs: number;

  constructor(configs: McpServerConfig[] = [], opts: { requestTimeoutMs?: number; logger?: Logger } = {}) {
    this.logger = opts.logger ?? new Logger('McpManager');
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 120_000;
    this.handles = new Map();
    this.toolServerMap = new Map();
    this.raw = new Map();
    this.configs = configs.map((c) => {
      const id = c.id || slugify(c.name || 'server');
      const normalized: McpServerConfig = {
        ...c,
        id,
        name: c.name || id,
        description: c.description || '',
        icon: c.icon ?? null,
        enabled: c.enabled !== false,
      };
      this.raw.set(id, normalized);
      return {
        id,
        name: normalized.name,
        description: normalized.description,
        icon: normalized.icon ?? null,
        enabled: c.enabled !== false,
      };
    });
  }

  hasServer(id: string): boolean {
    return this.raw.has(id) || this.configs.some((c) => c.name === id);
  }

  getConfig(id: string): McpRuntime['configs'][number] | undefined {
    return this.configs.find((c) => c.id === id || c.name === id);
  }

  addServer(config: McpServerConfig): { ok: boolean; error?: string } {
    const id = config.id || slugify(config.name || 'server');
    if (this.hasServer(id)) return { ok: false, error: `MCP server "${id}" already configured.` };
    const normalized: McpServerConfig = {
      ...config,
      id,
      name: config.name || id,
      description: config.description || '',
      icon: config.icon ?? null,
      enabled: config.enabled !== false,
    };
    this.raw.set(id, normalized);
    this.configs.push({
      id,
      name: normalized.name,
      description: normalized.description,
      icon: normalized.icon ?? null,
      enabled: config.enabled !== false,
    });
    return { ok: true };
  }

  removeServer(id: string): void {
    const idx = this.configs.findIndex((c) => c.id === id || c.name === id);
    if (idx >= 0) this.configs.splice(idx, 1);
    this.raw.delete(id);
    const handle = this.handles.get(id);
    if (handle) {
      handle.close();
      this.handles.delete(id);
    }
    for (const [toolName, serverId] of [...this.toolServerMap]) {
      if (serverId === id) this.toolServerMap.delete(toolName);
    }
  }

  enable(id: string): void {
    const cfg = this.configs.find((c) => c.id === id || c.name === id);
    const raw = this.raw.get(id);
    if (cfg) cfg.enabled = true;
    if (raw) raw.enabled = true;
  }

  disable(id: string): void {
    const cfg = this.configs.find((c) => c.id === id || c.name === id);
    const raw = this.raw.get(id);
    if (cfg) cfg.enabled = false;
    if (raw) raw.enabled = false;
  }

  isEnabled(id: string): boolean {
    return this.getConfig(id)?.enabled === true;
  }

  /** Status rows for the inspect_mcp_stock tool. */
  describe(): Array<{
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    active: boolean;
    activeInRun: boolean;
    toolCount: number;
  }> {
    return this.configs.map((cfg) => {
      const handle = this.handles.get(cfg.id);
      return {
        id: cfg.id,
        name: cfg.name,
        description: cfg.description,
        enabled: cfg.enabled,
        active: !!handle && !handle.closed,
        activeInRun: !!handle && !handle.closed && handle.tools.length > 0,
        toolCount: handle ? handle.tools.length : 0,
      };
    });
  }

  async activateServer(serverId: string): Promise<McpServerHandle> {
    const existing = this.handles.get(serverId);
    if (existing && !existing.closed) return existing;

    const cfg = this.raw.get(serverId);
    if (!cfg) throw new Error(`Unknown MCP server "${serverId}"`);
    if (cfg.enabled === false) throw new Error(`MCP server "${cfg.id}" is disabled — enable it first (request_mcp_approval).`);

    let handle: McpServerHandle;
    if (cfg.url) {
      handle = await createHttpClient(cfg.url, { headers: cfg.headers }, this.logger, this.requestTimeoutMs);
    } else if (cfg.command) {
      handle = await createStdioClient(
        cfg.command,
        cfg.args ?? [],
        cfg.env ?? {},
        cfg.cwd,
        this.logger,
        this.requestTimeoutMs,
      );
    } else {
      throw new Error(`MCP server "${cfg.id}" has neither url nor command — cannot connect.`);
    }

    handle.serverId = cfg.id;
    handle.name = cfg.name;
    this.handles.set(cfg.id, handle);
    for (const t of handle.tools) {
      this.toolServerMap.set(`${cfg.name}__${t.name}`, cfg.id);
    }
    return handle;
  }

  closeAll(): void {
    for (const handle of this.handles.values()) {
      try { handle.close(); } catch {}
    }
    this.handles.clear();
    this.toolServerMap.clear();
  }
}