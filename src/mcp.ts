/**
 * MCP stock-catalog shim. The source app bundles a stock MCP server catalog
 * (mcp-stock.ts). The harness library ships WITHOUT MCP infra; this shim keeps
 * the prompt-bleeding-edge logic compiling while rendering an empty catalog.
 */

export interface StockEntry {
  name: string;
  category: string;
  description?: string;
  envKeys?: string[];
  manualOAuth?: boolean;
  remote?: boolean;
  keyGetUrl?: string;
}

export function flattenStock(): StockEntry[] {
  return [];
}