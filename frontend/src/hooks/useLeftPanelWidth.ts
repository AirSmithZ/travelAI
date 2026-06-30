import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'travel_left_panel_width';
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 320;
const MAX_WIDTH_CAP = 560;

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return clampWidth(n);
  } catch {
    return DEFAULT_WIDTH;
  }
}

function maxWidthForViewport() {
  if (typeof window === 'undefined') return MAX_WIDTH_CAP;
  return Math.min(MAX_WIDTH_CAP, Math.floor(window.innerWidth * 0.4));
}

function clampWidth(width: number) {
  return Math.max(MIN_WIDTH, Math.min(width, maxWidthForViewport()));
}

export function useLeftPanelWidth() {
  const [width, setWidthState] = useState(readStoredWidth);

  const setWidth = useCallback((next: number) => {
    setWidthState(clampWidth(next));
  }, []);

  useEffect(() => {
    const onResize = () => {
      setWidthState((w) => clampWidth(w));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const persistWidth = useCallback((w: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(clampWidth(w)));
    } catch {
      /* ignore */
    }
  }, []);

  const startResize = useCallback(
    (clientX: number) => {
      const startX = clientX;
      const startW = width;

      const onMove = (ev: MouseEvent) => {
        setWidth(startW + (ev.clientX - startX));
      };

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const final = clampWidth(startW + (ev.clientX - startX));
        setWidthState(final);
        persistWidth(final);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [width, setWidth, persistWidth],
  );

  return { width, startResize };
}
