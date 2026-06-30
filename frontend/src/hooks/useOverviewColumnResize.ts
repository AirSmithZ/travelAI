import { useCallback, useEffect, useRef, useState } from 'react';
import { COLUMN_MIN_WIDTH } from '../utils/layoutOverview';

const MIN_RESIZE_WIDTH = 200;

export function useOverviewColumnResize(
  onResize: (dayIndex: number, width: number) => void,
  minWidth = COLUMN_MIN_WIDTH,
) {
  const resizeRef = useRef<{
    dayIndex: number;
    startX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);
  const [resizingDayIndex, setResizingDayIndex] = useState<number | null>(null);

  const endResize = useCallback(() => {
    resizeRef.current = null;
    setResizingDayIndex(null);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const session = resizeRef.current;
      if (!session || session.pointerId !== e.pointerId) return;
      const next = Math.max(
        MIN_RESIZE_WIDTH,
        minWidth,
        session.startWidth + (e.clientX - session.startX),
      );
      onResize(session.dayIndex, next);
    };

    const onUp = (e: PointerEvent) => {
      if (resizeRef.current?.pointerId === e.pointerId) endResize();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onResize, minWidth, endResize]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent, dayIndex: number, currentWidth: number) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        dayIndex,
        startX: e.clientX,
        startWidth: currentWidth,
        pointerId: e.pointerId,
      };
      setResizingDayIndex(dayIndex);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  return { onResizePointerDown, resizingDayIndex };
}
