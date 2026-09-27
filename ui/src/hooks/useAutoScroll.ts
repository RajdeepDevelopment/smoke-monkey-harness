import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAutoScrollOptions {
  /** Auto-follow while the stream is running (default true). */
  streaming?: boolean;
  /** Pixels from the bottom considered "scrolled to bottom" (default 120). */
  threshold?: number;
  /** Smooth scroll behavior (default true). */
  smooth?: boolean;
}

/**
 * Auto-scroll a chat scroll container to the newest message while the model
 * is streaming — unless the user has scrolled up to read. Scrolls back to the
 * bottom on resume.
 */
export function useAutoScroll<T extends HTMLElement>(options?: UseAutoScrollOptions) {
  const { streaming = true, threshold = 120, smooth = true } = options ?? {};
  const ref = useRef<T | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const follow = streaming && atBottom;

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = smooth ? 'smooth' : 'auto') => {
      const el = ref.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      setAtBottom(true);
    },
    [smooth]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !follow) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, [follow, smooth]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(distance <= threshold);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return { ref, atBottom, follow, scrollToBottom };
}