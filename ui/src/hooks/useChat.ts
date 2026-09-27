import { useEffect, useRef, useState } from 'react';
import { ChatRuntime } from '../runtime/ChatRuntime';
import type { ChatRuntimeOptions, ChatRuntimeState } from '../types/transport';

export interface UseChatResult extends ChatRuntimeState {
  runtime: ChatRuntime;
  /** Send a user turn. Safe to call while streaming (ignored). */
  send: (text: string, providerOptions?: Record<string, unknown>) => void;
  /** Cancel the in-flight request. */
  stop: () => void;
  /** Reset the transcript. */
  clear: () => void;
  /** True once the initial conversation (if any) has been loaded. */
  ready: boolean;
}

/**
 * Headless chat hook. Wraps a `ChatRuntime` built from your transport/store
 * and re-renders on every state change. The `transport` is captured once —
 * keep it stable across renders. `model`, `system` and `request` are read
 * fresh on every `send`.
 */
export function useChat(input: ChatRuntimeOptions): UseChatResult {
  const prevTransport = useRef<object | null>(null);
  const [runtime, setRuntime] = useState<ChatRuntime>(() => {
    prevTransport.current = input.transport;
    return new ChatRuntime({ ...input, onStateChange: () => {} });
  });
  const [state, setState] = useState<ChatRuntimeState>(() => runtime.getState());
  const [ready, setReady] = useState(false);

  if (prevTransport.current !== input.transport) {
    prevTransport.current = input.transport;
    const next = new ChatRuntime({ ...input, onStateChange: () => {} });
    setRuntime(next);
    setState(next.getState());
  }

  useEffect(() => {
    runtime.refresh(input, setState);
    void runtime
      .initialize()
      .catch(() => {})
      .then(() => {
        setState(runtime.getState());
        setReady(true);
      });
    return () => runtime.dispose();
  }, [runtime, input.transport]);

  return {
    ...state,
    runtime,
    ready,
    send: (text, providerOptions) => {
      void runtime.send(text, providerOptions);
    },
    stop: () => runtime.stop(),
    clear: () => {
      void runtime.clearConversation();
    },
  };
}