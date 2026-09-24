#!/usr/bin/env node
/**
 * smoke-monkey-harness-mcp — stdio MCP server for Smoke Monkey Harness.
 *
 * Thin launcher: resolves the real dependency-free MCP server that ships inside
 * the `smoke-monkey-harness` package (`plugin/mcp/server.mjs`) and runs it.
 * This keeps a single source of truth for the tools (harness_guide,
 * harness_plan, harness_api, harness_scaffold, harness_verify, ...) without
 * duplicating them here.
 *
 * Usage:
 *   npx -y smoke-monkey-harness-mcp
 *   node mcp-server/bin/smoke-monkey-harness-mcp.mjs   (within this repo)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = fileURLToPath(new URL('.', import.meta.url));

function resolveServer() {
  // 1) From an installed smoke-monkey-harness (the common npx case).
  try {
    return require.resolve('smoke-monkey-harness/plugin/mcp/server.mjs');
  } catch {
    /* fall through */
  }
  // 2) Local repo checkout fallback (plugin lives two levels up from mcp-server/bin).
  const repoPath = new URL('../../plugin/mcp/server.mjs', import.meta.url);
  return fileURLToPath(repoPath);
}

const server = resolveServer();
const child = spawn(process.execPath, [server], { stdio: 'inherit' });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
child.on('error', (err) => {
  console.error(`smoke-monkey-harness-mcp: failed to start server: ${err.message}`);
  process.exit(1);
});