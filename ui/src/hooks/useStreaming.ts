import { useEffect, useRef, useState } from 'react';

export interface UseStreamingOptions {
  /** Milliseconds between reveal steps (default 8). */
  intervalMs?: number;
  /** Characters revealed per step (default 2). */
  step?: number;
  /** Only reveal while enabled — pass false to show instantly. */
  enabled?: boolean;
}

export interface UseStreamingResult {
  /** Progressively-revealed substring of `content`. */
  revealed: string;
  /** True when the reveal has caught up with `content`. */
  done: boolean;
  /** Instantly reveal the rest. */
  flush: () => void;
}

/**
 * Cursor-based reveal for streamed markdown. Pairs with transports that emit
 * whole-text updates: feed the latest full string and this hook types it out
 * smoothly. Resets whenever `content` grows/changes.
 */
export function useStreaming(content: string | undefined, options?: UseStreamingOptions): UseStreamingResult {
  const { intervalMs = 8, step = 2, enabled = true } = options ?? {};
  const full = content ?? '';
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  countRef.current = count;

  useEffect(() => {
    setCount(0);
  }, [full]);

  useEffect(() => {
    if (!enabled) {
      setCount(full.length);
      return;
    }
    if (countRef.current >= full.length) return;
    const id = window.setInterval(() => {
      setCount((c) => Math.min(full.length, c + step));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [full, enabled, intervalMs, step]);

  const flush = () => setCount(full.length);

  return { revealed: full.slice(0, count), done: count >= full.length, flush };
}