import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';

/**
 * Below this row width the selector pills drop their labels and show icons only.
 *
 * Measured against the three-pill header at its natural width (~440px): below
 * that the labels start colliding with the brand, and a label clipped to
 * "MCP…" is worse than no label, because the icon already names the control.
 */
export const PILL_ICON_ONLY_WIDTH = 420;

/** True when the enclosing row is too narrow to afford pill labels. */
export const PillNarrowContext = createContext(false);

export function usePillNarrowContext(): boolean {
  return useContext(PillNarrowContext);
}

/**
 * Watch a row's width and publish "too narrow for labels" to its pills.
 *
 * This measures the row rather than the window on purpose: the chat UI is
 * embedded in panels of arbitrary size, and a 1600px window with a 380px
 * sidebar has to collapse exactly like a 380px window does. A CSS container
 * query would express the same rule, but the pills are injected as opaque
 * React nodes (the composer takes a `toolbar` slot), so context is what lets a
 * pill in one subtree learn the width of a row it does not render.
 */
export function usePillRow<T extends HTMLElement>(threshold: number = PILL_ICON_ONLY_WIDTH): {
  ref: RefObject<T>;
  narrow: boolean;
} {
  const ref = useRef<T>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure before paint where possible so the first frame is already correct.
    const measure = (): void => setNarrow(el.clientWidth < threshold);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [threshold]);

  return { ref, narrow };
}

export function PillRow({
  children,
  className,
  threshold,
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
}): ReactElement {
  const { ref, narrow } = usePillRow<HTMLDivElement>(threshold);
  return (
    <div ref={ref} className={className}>
      <PillNarrowContext.Provider value={narrow}>{children}</PillNarrowContext.Provider>
    </div>
  );
}
