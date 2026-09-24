/**
 * MCP guidance tools: `inspect_mcp_stock` and `request_mcp_approval`.
 *
 * These are lightweight/library-local implementations of the source app's
 * stock-recommendation tools. They read the runtime's CONFIGURED servers (the
 * user supplies configs via AgentOptions.mcp / addServer()) and surface
 * actionable recommendations. Their `data` payload is what triggers the loop's
 * MCP-approval pause:
 *
 *   data.recommendedToEnableIds  → servers configured but DISABLED that match
 *                                  the current task (or explicitly requested).
 *   data.recommendedToAddIds     → always [] here — the library never
 *                                  auto-provisions; unconfigured stock servers
 *                                  must be added to options.mcp first.
 */
import type { ToolDefinition, ToolResult } from './tool-registry.js';
import type { McpRuntime } from '../services/mcp-manager.js';
import { findStockEntry } from '../mcp.js';
import { MAX_MCP_RECOMMEND } from '../context/sub-context.js';

export interface McpStockRow {
  category: string;
  name: string;
  id: string;
  description: string;
  enabled: boolean;
  active: boolean;
  activeInRun: boolean;
  toolCount: number;
  keyRequired: boolean;
  transport: 'stdio' | 'http' | 'unknown';
}

const CATEGORY_SINKS: Array<{ id: string; category: string; enabled: boolean }> = [];

export function getInspectMcpStockTool(mcp: McpRuntime): ToolDefinition {
  return {
    name: 'inspect_mcp_stock',
    description:
      'Inspect configured MCP servers and get recommendations for the current task. ' +
      'Returns the catalog of configured servers with live status (enabled/disabled, ' +
      'active, tool count, key requirements) plus recommendedToEnableIds — servers the ' +
      'task needs but that are currently DISABLED. Call this BEFORE doing work that ' +
      'touches an external system (browser, DB, GitHub, deploy, …). The run pauses for ' +
      'the user to enable/skip any recommended servers.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The current task/sub-task text for relevance ranking.' },
        includeCategories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional category filter (e.g. ["Web & Scraping", "Code & Git"]).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input: Record<string, unknown>): Promise<ToolResult> => {
      const task = String(input.task ?? '').trim();
      const categoryFilter = (input.includeCategories as string[] | undefined) ?? [];
      const rows: McpStockRow[] = mcp.configs.map((cfg) => {
        const stock = findStockEntry(cfg.name) ?? findStockEntry(cfg.id);
        const handle = mcp.handles.get(cfg.id);
        const keyRequired = stock
          ? (stock.envKeys ?? []).length > 0 || stock.manualOAuth || stock.remote || Boolean(stock.keyGetUrl)
          : false;
        return {
          category: stock?.category ?? 'custom',
          name: cfg.name,
          id: cfg.id,
          description: cfg.description,
          enabled: cfg.enabled,
          active: !!handle && !handle.closed,
          activeInRun: !!handle && !handle.closed && handle.tools.length > 0,
          toolCount: handle ? handle.tools.length : 0,
          keyRequired,
          transport: stock?.url ? 'http' : (stock?.command || stock?.args ? 'stdio' : 'unknown'),
        };
      });

      const filtered = categoryFilter.length > 0 ? rows.filter((r) => categoryFilter.includes(r.category)) : rows;

      const recommendedToEnableIds = recommendToEnable(filtered, task);

      const lines: string[] = [];
      lines.push(`Configured MCP servers (${rows.length}${categoryFilter.length ? `, filtered to ${categoryFilter.join(', ')}` : ''}):`);
      if (rows.length === 0) {
        lines.push('  None configured. Add servers via AgentOptions.mcp / agent.addServer(config) to make their tools available.');
      } else {
        for (const r of filtered) {
          const status = r.enabled ? (r.activeInRun ? 'active' : 'enabled-idle') : 'disabled';
          const keyTag = r.keyRequired ? ' · key-required' : ' · keyless';
          const toolsTag = r.activeInRun ? ` · ${r.toolCount} tools` : '';
          lines.push(`  - mcp_${r.id} [${status}${keyTag}${toolsTag}] — ${r.name}: ${r.description} (${r.category})`);
        }
      }

      if (recommendedToEnableIds.length > 0) {
        lines.push('');
        lines.push(
          `Recommended to ENABLE for this task (pausing for your decision): ${recommendedToEnableIds.join(', ')}. ` +
            'Activate their mcp_<id> contexts after the decision to bring the tools online.',
        );
      } else if (rows.length > 0) {
        lines.push('');
        lines.push('No disabled servers match this task — nothing to enable. Stock servers NOT configured here must be added to options.mcp before use.');
      }

      return {
        success: true,
        output: lines.join('\n'),
        summary: `${rows.length} configured server(s), ${recommendedToEnableIds.length} to enable`,
        data: {
          task: task || null,
          servers: filtered,
          recommendedToEnableIds,
          recommendedToAddIds: [] as string[],
        },
      };
    },
  };
}

function recommendToEnable(rows: McpStockRow[], task: string): string[] {
  if (!task) return [];
  const tokenSet = new Set(task.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const scored = rows
    .filter((r) => !r.enabled)
    .map((r) => {
      const hay = `${r.name} ${r.description} ${r.category}`.toLowerCase();
      let score = 0;
      for (const w of tokenSet) if (hay.includes(w)) score += 1;
      if (tokenSet.has(r.name.toLowerCase())) score += 2;
      return { r, score };
    })
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MCP_RECOMMEND);
  return scored.map((s) => s.r.id);
}

export function getRequestMcpApprovalTool(mcp: McpRuntime): ToolDefinition {
  return {
    name: 'request_mcp_approval',
    description:
      'Request the user approve enabling specific configured-but-DISABLED MCP servers for ' +
      'the current task. Provide the exact server ids; the run pauses until the user decides ' +
      '(continue / skip). Use this when a task genuinely requires a disabled server (or one ' +
      'whose keys are missing). Never request servers that are already enabled.',
    inputSchema: {
      type: 'object',
      properties: {
        serverIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'MCP server ids to enable (use the id from inspect_mcp_stock).',
        },
        reason: { type: 'string', description: 'Why this server is required for the task.' },
      },
      required: ['serverIds'],
    },
    annotations: { readOnlyHint: true },
    execute: async (input: Record<string, unknown>): Promise<ToolResult> => {
      const ids = (input.serverIds as unknown[]) ?? [];
      const reason = String(input.reason ?? '').trim();
      const requested = ids.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);

      const unknown = requested.filter((id) => !mcp.configs.some((c) => c.id === id || c.name === id));
      const toEnable = requested.filter((id) => {
        const cfg = mcp.configs.find((c) => c.id === id || c.name === id);
        return cfg && !cfg.enabled;
      });

      const lines: string[] = [];
      if (unknown.length > 0) {
        lines.push(`Unknown server id(s): ${unknown.join(', ')}. Configured ids: ${mcp.configs.map((c) => c.id).join(', ') || '(none)'}.`);
      }
      if (toEnable.length > 0) {
        lines.push(`Requesting user approval to enable: ${toEnable.join(', ')}${reason ? ` — ${reason}` : ''}. The run pauses for the decision.`);
      } else {
        lines.push(requested.length === 0 ? 'No server ids provided.' : 'All requested servers are already enabled — nothing to approve.');
      }

      return {
        success: true,
        output: lines.join('\n'),
        summary: `requesting enable of ${toEnable.join(', ') || '(none)'}`,
        data: {
          task: reason || null,
          servers: toEnable.map((id) => mcp.configs.find((c) => c.id === id || c.name === id)),
          requestedIds: toEnable,
          recommendedToEnableIds: toEnable,
          recommendedToAddIds: [] as string[],
          unknownIds: unknown,
        },
      };
    },
  };
}