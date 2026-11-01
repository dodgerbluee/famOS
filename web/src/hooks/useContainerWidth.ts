import { useCallback, useLayoutEffect, useState } from 'react';

/**
 * Measures the width a component actually receives, using ResizeObserver on the
 * element itself rather than `window.innerWidth` or a one-time `matchMedia` read.
 *
 * Returns a ref to attach to the element and its current border-box width in CSS
 * pixels. The width is 0 until the element has been measured, so callers that pick
 * a layout from the width should treat 0 as "not measured yet".
 */
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>() {
  const [container, setContainer] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((node: T | null) => {
    setContainer(node);
  }, []);

  useLayoutEffect(() => {
    if (!container) return;

    const measure = () => setWidth(Math.round(container.getBoundingClientRect().width));
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  return { ref, width } as const;
}
