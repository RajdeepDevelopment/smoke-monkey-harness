/**
 * Revert demo — server.
 *
 * A REAL harness (real loop, real file tools, real checkpoints, real revert)
 * behind a WebSocket, so the chat UI's revert control can be tried in a browser.
 *
 *   npx tsx examples/revert-demo/server.ts            # offline: scripted mock model, no API key
 *   NVIDIA_API_KEY=... npx tsx examples/revert-demo/server.ts --live   # a real model
 *
 * Only the *model* is faked in the default mode: a tiny local server answers the
 * harness's LLM requests with scripted tool calls (write_file / delete_file /
 * run_command, then finish_task). Everything after the model — the tools, the
 * workspace changes, the shadow-git checkpoints, `agent.revert()` — is the real
 * thing, working on real files you can watch in your editor.
 *
 * One WebSocket per chat turn, as `WebSocketTransport` does it, plus a short-lived
 * one per revert request.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { createAgent } from '../../src/index.js';
import { createHarnessBridge, revertHarnessRun, type HarnessBridge } from '../../ui/src/runtime/harnessBridge.js';

const WS_PORT = Number(process.env.DEMO_WS_PORT ?? 4010);
const LLM_PORT = Number(process.env.DEMO_LLM_PORT ?? 4011);
const LIVE = process.argv.includes('--live');
const SESSION = 'revert-demo';

// ── The workspace the agent edits ────────────────────────────────────────────

const customWorkspace = process.env.DEMO_WORKSPACE;
const workspace = path.resolve(customWorkspace ?? path.join(os.tmpdir(), 'smoke-monkey-revert-demo'));
// Only ever wipe our OWN temp folder — never a directory the user pointed us at.
if (!customWorkspace) fs.rmSync(workspace, { recursive: true, force: true });
const seed: Record<string, string> = {
  'README.md': '# Demo workspace\n\nThe agent edits files here. Revert undoes them.\n',
  'notes.txt': 'original notes\n',
  'src/app.ts': 'export const greeting = "hello";\n',
};
for (const [file, body] of Object.entries(seed)) {
  const abs = path.join(workspace, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, body);
}

// ── Mock model (offline mode) ────────────────────────────────────────────────

interface ToolStep { name: string; args: Record<string, unknown> }

const CONTEXT = 'todo_management';

/**
 * What the scripted "model" decides to do for a task: open a sub-context, write a
 * task list, do the work, tick the list off. (So the status rail has something to
 * show — and keep — across messages.)
 */
function planFor(task: string): ToolStep[] {
  // "close the context" — the agent explicitly drops both, which is the ONLY thing that should.
  if (/\bclose\b.*\b(context|todo|list)\b/i.test(task)) {
    return [
      { name: 'context_manage', args: { action: 'deactivate', contextId: CONTEXT } },
      { name: 'todo_write', args: { todos: [] } },
    ];
  }
  const work = workFor(task);
  if (!work.length) return [];
  const label = (s: ToolStep) => `${s.name} ${String(s.args.path ?? s.args.command)}`;
  const list = (done: boolean) => ({
    todos: work.map((s, i) => ({
      content: label(s),
      status: done ? 'completed' : i === 0 ? 'in_progress' : 'pending',
      priority: 'medium',
    })),
  });
  return [
    { name: 'context_manage', args: { action: 'activate', contextId: CONTEXT } },
    { name: 'todo_write', args: list(false) },
    ...work,
    { name: 'todo_write', args: list(true) },
  ];
}

function workFor(task: string): ToolStep[] {
  const files = [...task.matchAll(/(?<![\w.])([\w./-]+\.[A-Za-z0-9]{1,5})\b/g)].map((m) => m[1]!);
  const command = task.match(/`([^`]+)`/)?.[1];
  if (command) return [{ name: 'run_command', args: { command } }];
  if (/\b(delete|remove)\b/i.test(task)) return files.map((f) => ({ name: 'delete_file', args: { path: f } }));
  if (/\b(create|add|write|rewrite|update|edit|change)\b/i.test(task)) {
    return files.map((f) => ({
      name: 'write_file',
      args: { path: f, content: `// written by the demo agent\n// task: ${task}\n// at: ${new Date().toISOString()}\n` },
    }));
  }
  return [];
}

/** Ollama-style `/api/chat` reply: the next scripted step for the current turn. */
function mockReply(messages: Array<{ role: string; content?: string }>) {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const task = String(messages[lastUser]?.content ?? '');
  const done = messages.slice(lastUser + 1).filter((m) => m.role === 'tool').length;
  const plan = planFor(task);

  const call = (name: string, args: Record<string, unknown>, content = '') => ({
    message: { role: 'assistant', content, tool_calls: [{ function: { name, arguments: args } }] },
    prompt_eval_count: 10, eval_count: 5,
  });

  if (!plan.length) {
    return {
      message: {
        role: 'assistant',
        content: 'I only demo file changes. Try: `create hello.txt`, `rewrite src/app.ts`, `delete notes.txt`, a command in backticks like `echo built > out.txt`, or `close the context` to drop the task list and sub-context.',
      },
    };
  }
  if (done < plan.length) {
    const step = plan[done]!;
    const target = step.args.path ?? step.args.command ?? step.args.contextId ?? '';
    return call(step.name, step.args, `${step.name} ${String(target)}…`.trim());
  }
  return call('finish_task', { summary: `Done — ${plan.length} change${plan.length === 1 ? '' : 's'} applied. Hover your message and press ↶ to revert.` });
}

function startMockLlm(): Promise<string> {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/api/chat')) {
      res.writeHead(404).end();
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        const body = JSON.parse(raw) as { messages: Array<{ role: string; content?: string }> };
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(mockReply(body.messages)));
      } catch (err) {
        res.writeHead(400).end(String(err));
      }
    });
  });
  return new Promise((resolve) => server.listen(LLM_PORT, '127.0.0.1', () => resolve(`http://127.0.0.1:${LLM_PORT}`)));
}

// ── The harness ──────────────────────────────────────────────────────────────

const llmUrl = LIVE ? undefined : await startMockLlm();
const agent = createAgent({
  // NVIDIA is the project default for real models; the mock speaks the keyless
  // `ollama` wire format only because that is the one that is not tied to a cloud URL.
  provider: LIVE ? 'nvidia' : 'ollama',
  model: LIVE ? (process.env.DEMO_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b') : 'mock',
  apiKey: LIVE ? process.env.NVIDIA_API_KEY : undefined,
  baseUrl: llmUrl,
  workspacePath: workspace,
  sessionId: SESSION,
  autoApprove: true,      // the demo has no permission dialogs; use a policy in a real app
  checkpoints: true,      // ← the only line that turns revert on
  logger: { level: 'warn' },
});

// ── WebSocket: chat turns + revert requests ──────────────────────────────────

let running = false;

function runTurn(ws: WebSocket, text: string): void {
  if (running) {
    ws.send(JSON.stringify({ type: 'error', error: { code: 'busy', message: 'A run is already in progress.', retryable: true } }));
    ws.close();
    return;
  }
  running = true;
  const messageId = `msg_${Date.now().toString(36)}`;
  const bridge: HarnessBridge = createHarnessBridge({ agent: agent as never, messageId });
  (ws as WebSocket & { bridge?: HarnessBridge }).bridge = bridge;
  const send = (event: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(event));

  send({ type: 'message:start', messageId });
  const done = agent.run(text, { sessionId: SESSION });
  void (async () => {
    try {
      for await (const event of bridge.events()) send(event);
      await done;
    } finally {
      bridge.dispose();
      running = false;
      ws.close();
    }
  })();
  ws.on('close', () => { if (running) agent.abort(); });
}

// The same port serves the WebSocket AND `GET /state`: the task list and open
// sub-contexts the agent has right now, so a refreshed page can restore its rail.
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(agent.getRunState(SESSION)));
    return;
  }
  res.writeHead(404).end();
});
httpServer.listen(WS_PORT);
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    let msg: { type?: string; requestId?: string; text?: string; data?: Record<string, unknown> };
    try { msg = JSON.parse(String(raw)); } catch { return; }

    if (msg.type === 'revert') {
      // Between runs: no bridge. One call; it never throws.
      const data = await revertHarnessRun(agent as never, msg.data as never);
      ws.send(JSON.stringify({ type: 'revert_result', requestId: msg.requestId, data }));
      return;
    }
    const bridge = (ws as WebSocket & { bridge?: HarnessBridge }).bridge;
    if (msg.type === 'resolve_ask_user' && bridge) {
      bridge.answer({ toolCallId: String(msg.data?.toolCallId), kind: 'ask', answer: String(msg.data?.response ?? '') });
    } else if (msg.type === 'resolve_permission' && bridge) {
      bridge.answer({ toolCallId: String(msg.data?.toolCallId), kind: 'permission', answer: String(msg.data?.decision ?? 'deny') });
    } else if (typeof msg.text === 'string' && msg.text.trim()) {
      runTurn(ws, msg.text);
    }
  });
});

console.log(`
  Smoke Monkey — revert demo   (${LIVE ? 'LIVE model' : 'offline mock model'})
  ───────────────────────────────────────────────
  websocket   ws://localhost:${WS_PORT}
  workspace   ${workspace}
              ↑ the agent edits these REAL files — watch them in your editor/terminal

  Try, then press ↶ under your message:
    create hello.txt
    rewrite src/app.ts
    delete notes.txt
    \`echo built > out.txt\`        (a shell command — revert undoes that too)
    close the context            (the agent drops the task list + sub-context)

  Every turn opens the "todo_management" sub-context and writes a task list. Both
  stay on screen after the run ends, across messages, and after a page refresh —
  until the agent closes them.
`);
