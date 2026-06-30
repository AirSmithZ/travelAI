import { useCallback, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

export type NodeAnchor = { x: number; y: number };

export function useOverviewNodeAnchors(
  containerRef: RefObject<HTMLElement | null>,
  revision: unknown,
): Map<string, NodeAnchor> {
  const [anchors, setAnchors] = useState<Map<string, NodeAnchor>>(new Map());

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const map = new Map<string, NodeAnchor>();
    container.querySelectorAll('[data-overview-node]').forEach((el) => {
      const id = el.getAttribute('data-overview-node');
      if (!id) return;
      const rect = el.getBoundingClientRect();
      map.set(id, {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
      });
    });
    setAnchors(map);
  }, [containerRef]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    const body = container.closest('.overview-shell__body');
    body?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      body?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, revision]);

  return anchors;
}
