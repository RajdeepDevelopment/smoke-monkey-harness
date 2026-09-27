import { useEffect, useLayoutEffect } from 'react';

/** useLayoutEffect that safely no-ops during SSR. */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;