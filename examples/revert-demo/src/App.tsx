import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { SmokeMonkeyChat, WebSocketTransport, createNormalizedStreamParser } from '@smoke-monkey/ui';

type ChatProps = ComponentProps<typeof SmokeMonkeyChat>;
const WS_URL = import.meta.env.VITE_DEMO_WS ?? 'ws://localhost:4010';

/**
 * The whole client side of "revert":
 *
 *  1. `createNormalizedStreamParser()` — the server forwards the harness bridge's
 *     events unchanged. A hand-written parser list would silently drop
 *     `checkpoint:created`, and without it no message gets a revert control.
 *  2. `WebSocketTransport` already has `revert()`; `SmokeMonkeyChat` shows the ↶
 *     control on any user message the transport can revert. Nothing else to wire.
 *  3. `onReverted` is optional — the prompt is put back in the input box for you.
 */
export function App() {
  const transport = useMemo(
    () => new WebSocketTransport({ url: WS_URL, parser: createNormalizedStreamParser() }),
    [],
  );
  const [last, setLast] = useState<string>('');

  // After a refresh the page has no memory of the agent's task list or open
  // sub-contexts, but the server does (`agent.getRunState()`): seed the rail from it.
  const [seed, setSeed] = useState<{ todos: ChatProps['initialTodos']; contexts: ChatProps['initialContexts'] }>({ todos: [], contexts: null });
  useEffect(() => {
    fetch(WS_URL.replace(/^ws/, 'http') + '/state')
      .then((r) => r.json())
      .then((s) => setSeed({ todos: s.todos, contexts: s.contexts.active.length ? s.contexts : null }))
      .catch(() => undefined);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', font: '12px ui-monospace, monospace', color: '#a1a1aa', borderBottom: '1px solid #27272a' }}>
        revert demo · hover your message and press ↶ ·{' '}
        {last || 'the agent edits real files in the workspace folder printed by the server'}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SmokeMonkeyChat
          transport={transport}
          theme="dark"
          brand={{ name: 'Smoke Monkey' }}
          sessionTitle="Revert demo"
          initialTodos={seed.todos}
          initialContexts={seed.contexts}
          suggestions={[
            'create hello.txt and extra.txt',
            'rewrite src/app.ts',
            'delete notes.txt',
            '`echo built > out.txt`',
            'close the context',
          ]}
          onReverted={({ result }) => {
            const { added, modified, deleted } = result.changes;
            setLast(`reverted — removed ${added.length}, restored ${modified.length + deleted.length} file(s)`);
          }}
        />
      </div>
    </div>
  );
}
