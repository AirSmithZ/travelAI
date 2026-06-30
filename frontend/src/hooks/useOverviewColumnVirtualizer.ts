import { useEffect, useState, type RefObject } from 'react';

const COLUMN_BUFFER = 1;

export interface ColumnVisibleRange {
  start: number;
  end: number;
}

function findColumnAtOffset(offsets: number[], scrollLeft: number): number {
  for (let i = offsets.length - 1; i >= 0; i -= 1) {
    if (scrollLeft >= offsets[i] - 1) return i;
  }
  return 0;
}

/** 总览模式列虚拟化：支持可变列宽 */
export function useOverviewColumnVirtualizer(
  scrollRef: RefObject<HTMLElement | null>,
  dayCount: number,
  columnOffsets: number[],
  columnWidths: number[],
  enabled: boolean,
): ColumnVisibleRange {
  const [range, setRange] = useState<ColumnVisibleRange>({ start: 0, end: dayCount });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled || dayCount === 0 || columnOffsets.length === 0) {
      setRange({ start: 0, end: dayCount });
      return;
    }

    const update = () => {
      const scrollLeft = el.scrollLeft;
      const viewWidth = el.clientWidth;
      const startCol = Math.max(
        0,
        findColumnAtOffset(columnOffsets, scrollLeft) - COLUMN_BUFFER,
      );
      const endScroll = scrollLeft + viewWidth;
      let endCol = dayCount;
      for (let i = startCol; i < dayCount; i += 1) {
        const colEnd = columnOffsets[i] + (columnWidths[i] ?? 0);
        if (columnOffsets[i] > endScroll) {
          endCol = i;
          break;
        }
        if (colEnd >= endScroll) {
          endCol = Math.min(dayCount, i + 1 + COLUMN_BUFFER);
          break;
        }
      }
      endCol = Math.min(dayCount, Math.max(endCol, startCol + 1));
      setRange((prev) =>
        prev.start === startCol && prev.end === endCol ? prev : { start: startCol, end: endCol },
      );
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollRef, dayCount, columnOffsets, columnWidths, enabled]);

  return range;
}
