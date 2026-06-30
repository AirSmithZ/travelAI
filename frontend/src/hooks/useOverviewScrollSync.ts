import { useCallback, useRef, useState, type WheelEvent } from 'react';

/** 总览图滚动：仅 body 滚动，顶栏/左轨通过 transform 同步，避免滚动条占位导致列不对齐 */
export function useOverviewScrollSync() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState({ left: 0, top: 0 });

  const onBodyScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const { scrollLeft, scrollTop } = body;
    setScrollOffset((prev) =>
      prev.left === scrollLeft && prev.top === scrollTop
        ? prev
        : { left: scrollLeft, top: scrollTop },
    );
  }, []);

  const forwardWheelToBody = useCallback((e: WheelEvent) => {
    const body = bodyRef.current;
    if (!body) return;
    const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
    const deltaY = e.shiftKey ? 0 : e.deltaY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX > absY) {
      body.scrollLeft += deltaX;
      e.preventDefault();
    } else if (absY > 0) {
      body.scrollTop += deltaY;
      e.preventDefault();
    }
  }, []);

  return {
    bodyRef,
    scrollLeft: scrollOffset.left,
    scrollTop: scrollOffset.top,
    onBodyScroll,
    forwardWheelToBody,
  };
}
