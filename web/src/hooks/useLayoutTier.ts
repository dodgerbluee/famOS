import { useLayoutEffect, useState, type RefObject } from 'react';

export type LayoutTier = 'compact' | 'medium' | 'wide';

export function layoutTierForWidth(width: number): LayoutTier {
  if (width < 720) return 'compact';
  if (width < 1120) return 'medium';
  return 'wide';
}

export function useLayoutTier(ref: RefObject<Element | null>): LayoutTier {
  const [tier, setTier] = useState<LayoutTier>('medium');

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number) => {
      if (width > 0) setTier(layoutTierForWidth(width));
    };
    update(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      const borderBox = entry.borderBoxSize[0];
      update(borderBox?.inlineSize ?? entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return tier;
}

export function useElementSize(ref: RefObject<Element | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number, height: number) => {
      setSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    update(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(([entry]) => {
      const borderBox = entry.borderBoxSize[0];
      update(borderBox?.inlineSize ?? entry.contentRect.width, borderBox?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
