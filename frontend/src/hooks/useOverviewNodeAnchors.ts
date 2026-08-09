import { useCallback, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

export type NodeAnchor = { x: number; y: number };

function anchorsEqual(a: Map<string, NodeAnchor>, b: Map<string, NodeAnchor>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, next] of b) {
    const cur = a.get(id);
    if (!cur || cur.x !== next.x || cur.y !== next.y) return false;
  }
  return true;
}

function revisionKey(revision: unknown): string {
  if (Array.isArray(revision)) return revision.map((v) => String(v ?? '')).join('\0');
  return String(revision ?? '');
}

export function useOverviewNodeAnchors(
  containerRef: RefObject<HTMLElement | null>,
  revision: unknown,
): Map<string, NodeAnchor> {
  const [anchors, setAnchors] = useState<Map<string, NodeAnchor>>(new Map());
  const revKey = revisionKey(revision);

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
    setAnchors((prev) => (anchorsEqual(prev, map) ? prev : map));
  }, [containerRef]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    // OV-01: also observe each node card so height drift updates edges
    container.querySelectorAll('[data-overview-node]').forEach((el) => ro.observe(el));
    const body = container.closest('.overview-shell__body');
    body?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      body?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, revKey, containerRef]);

  return anchors;
}
