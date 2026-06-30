import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayPlan } from '../types/itinerary';
import type { OverviewLayout, OverviewMetrics } from '../utils/layoutOverview';
import {
  CELL_PADDING,
  EMPTY_CELL_HEIGHT,
  predictNodePlacementInCell,
} from '../utils/layoutOverview';
import {
  OVERVIEW_DRAG_ACTIVATION_PX,
  OVERVIEW_REGION_CROSS_PX,
} from '../utils/graphLayoutConstants';

export interface NodeDragCellContext {
  originOffsetX: number;
  originOffsetY: number;
  baseX: number;
  basePlaceY: number;
  nodeWidth: number;
  nodeHeight: number;
  cellInnerWidth: number;
}

interface LayoutSnapshot {
  regions: string[];
  regionHeights: Map<string, number>;
  columnOffsets: number[];
  columnWidths: number[];
}

interface DragSession {
  nodeId: string;
  dayIndex: number;
  region: string;
  stickyTargetRegion: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetY: number;
  activated: boolean;
  captureEl: HTMLElement | null;
  layoutSnapshot: LayoutSnapshot;
  cell: NodeDragCellContext;
}

export interface DragCommitPatch {
  region?: string;
  fromRegion?: string;
  overview_offset?: { x: number; y: number };
}

interface UseOverviewNodeDragOptions {
  matrixRef: React.RefObject<HTMLDivElement | null>;
  layout: OverviewLayout;
  days: DayPlan[];
  metrics: OverviewMetrics;
  onCommit: (dayIndex: number, nodeId: string, patch: DragCommitPatch) => void;
}

export interface DragPreview {
  nodeId: string;
  dayIndex: number;
  sourceRegion: string;
  targetRegion: string;
  dx: number;
  useGhost: boolean;
  ghostMatrixLeft: number;
  ghostMatrixTop: number;
  ghostLocalDx: number;
  ghostLocalDy: number;
  ghostWidth: number;
  ghostHeight: number;
}

function snapshotLayout(layout: OverviewLayout): LayoutSnapshot {
  return {
    regions: [...layout.regions],
    regionHeights: new Map(layout.regionHeights),
    columnOffsets: [...layout.columnOffsets],
    columnWidths: [...layout.columnWidths],
  };
}

export function resolveRegionAtMatrixY(
  matrixY: number,
  snapshot: LayoutSnapshot,
): string | null {
  if (matrixY < 0) return null;
  let acc = 0;
  for (const region of snapshot.regions) {
    const h = snapshot.regionHeights.get(region) ?? EMPTY_CELL_HEIGHT;
    if (matrixY >= acc && matrixY < acc + h) return region;
    acc += h;
  }
  return snapshot.regions[snapshot.regions.length - 1] ?? null;
}

function regionTopAt(snapshot: LayoutSnapshot, region: string): number {
  let acc = 0;
  for (const r of snapshot.regions) {
    if (r === region) return acc;
    acc += snapshot.regionHeights.get(r) ?? EMPTY_CELL_HEIGHT;
  }
  return acc;
}

function matrixPoint(
  matrix: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = matrix.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function isInDayColumn(
  matrixX: number,
  dayIndex: number,
  snapshot: LayoutSnapshot,
): boolean {
  const colLeft = snapshot.columnOffsets[dayIndex] ?? 0;
  const colWidth = snapshot.columnWidths[dayIndex] ?? 0;
  return matrixX >= colLeft && matrixX <= colLeft + colWidth;
}

function isDragActivated(dx: number, dy: number): boolean {
  return (
    Math.abs(dx) >= OVERVIEW_DRAG_ACTIVATION_PX ||
    Math.abs(dy) >= OVERVIEW_DRAG_ACTIVATION_PX
  );
}

function clampMatrixNodeLeft(
  matrixNodeLeft: number,
  dayIndex: number,
  nodeWidth: number,
  snapshot: LayoutSnapshot,
): number {
  const colLeft = snapshot.columnOffsets[dayIndex] ?? 0;
  const colWidth = snapshot.columnWidths[dayIndex] ?? 0;
  const minLeft = colLeft + CELL_PADDING;
  const maxLeft = colLeft + colWidth - CELL_PADDING - nodeWidth;
  return Math.max(minLeft, Math.min(maxLeft, matrixNodeLeft));
}

function resolveOffsetX(session: DragSession, clientX: number): number {
  const snap = session.layoutSnapshot;
  const colLeft = snap.columnOffsets[session.dayIndex] ?? 0;
  const deltaX = clientX - session.startX;
  const matrixNodeLeft =
    colLeft + CELL_PADDING + session.cell.baseX + session.cell.originOffsetX + deltaX;
  const clampedLeft = clampMatrixNodeLeft(
    matrixNodeLeft,
    session.dayIndex,
    session.cell.nodeWidth,
    snap,
  );
  return clampedLeft - colLeft - CELL_PADDING - session.cell.baseX;
}

function nodeMatrixTop(
  session: DragSession,
  clientY: number,
  matrix: HTMLElement,
): number {
  const matrixRect = matrix.getBoundingClientRect();
  return clientY - session.grabOffsetY - matrixRect.top;
}

function resolveOffsetY(
  session: DragSession,
  clientY: number,
  matrix: HTMLElement,
): number {
  const snap = session.layoutSnapshot;
  const top = nodeMatrixTop(session, clientY, matrix);
  const sourceRegionTop = regionTopAt(snap, session.region);
  const raw = top - sourceRegionTop - CELL_PADDING - session.cell.basePlaceY;
  const rowH = snap.regionHeights.get(session.region) ?? EMPTY_CELL_HEIGHT;
  const innerH = rowH - CELL_PADDING * 2;
  const maxY = Math.max(0, innerH - session.cell.nodeHeight);
  return Math.max(0, Math.min(maxY, raw));
}

/** 滞回换区：中心靠近行边界超过阈值才切换，避免边界抖动 */
function resolveStickyTargetRegion(
  stickyRegion: string,
  nodeCenterY: number,
  snap: LayoutSnapshot,
): string {
  const regions = snap.regions;
  const idx = regions.indexOf(stickyRegion);
  if (idx < 0) return stickyRegion;

  const rowTop = regionTopAt(snap, stickyRegion);
  const rowH = snap.regionHeights.get(stickyRegion) ?? EMPTY_CELL_HEIGHT;

  if (idx < regions.length - 1 && nodeCenterY > rowTop + rowH - OVERVIEW_REGION_CROSS_PX) {
    return regions[idx + 1]!;
  }
  if (idx > 0 && nodeCenterY < rowTop + OVERVIEW_REGION_CROSS_PX) {
    return regions[idx - 1]!;
  }
  return stickyRegion;
}

function buildCommitPatch(
  session: DragSession,
  targetRegion: string,
  nextOffsetX: number,
  nextOffsetY: number,
  clientX: number,
  day: DayPlan | undefined,
  metrics: OverviewMetrics,
): DragCommitPatch {
  const regionChanged = targetRegion !== session.region;
  const offsetXChanged = nextOffsetX !== session.cell.originOffsetX;
  const offsetYChanged = nextOffsetY !== session.cell.originOffsetY;
  const patch: DragCommitPatch = {};

  if (regionChanged) {
    patch.region = targetRegion;
    patch.fromRegion = session.region;
  }

  if (!offsetXChanged && !offsetYChanged) return patch;

  if (regionChanged) {
    const predicted = day
      ? predictNodePlacementInCell(day, targetRegion, session.nodeId, metrics)
      : null;
    if (predicted && offsetXChanged) {
      const snap = session.layoutSnapshot;
      const colLeft = snap.columnOffsets[session.dayIndex] ?? 0;
      const deltaX = clientX - session.startX;
      const matrixNodeLeft =
        colLeft +
        CELL_PADDING +
        session.cell.baseX +
        session.cell.originOffsetX +
        deltaX;
      const clampedLeft = clampMatrixNodeLeft(
        matrixNodeLeft,
        session.dayIndex,
        session.cell.nodeWidth,
        snap,
      );
      patch.overview_offset = {
        x: clampedLeft - colLeft - CELL_PADDING - predicted.x,
        y: 0,
      };
    }
  } else {
    patch.overview_offset = { x: nextOffsetX, y: nextOffsetY };
  }

  return patch;
}

interface DragFrameState {
  targetRegion: string;
  stickyRegion: string;
  preview: DragPreview;
  patch: DragCommitPatch;
  hasChange: boolean;
}

function computeDragFrame(
  session: DragSession,
  clientX: number,
  clientY: number,
  matrix: HTMLElement,
  stickyRegion: string,
  day: DayPlan | undefined,
  metrics: OverviewMetrics,
): DragFrameState | null {
  const snap = session.layoutSnapshot;
  const pt = matrixPoint(matrix, clientX, clientY);

  if (!isInDayColumn(pt.x, session.dayIndex, snap)) return null;

  const matrixTop = nodeMatrixTop(session, clientY, matrix);
  const nodeCenterY = matrixTop + session.cell.nodeHeight / 2;
  const stickyTarget = resolveStickyTargetRegion(stickyRegion, nodeCenterY, snap);
  const nextOffsetX = resolveOffsetX(session, clientX);
  const nextOffsetY = resolveOffsetY(session, clientY, matrix);
  const regionChanged = stickyTarget !== session.region;
  const offsetXChanged = nextOffsetX !== session.cell.originOffsetX;
  const offsetYChanged = nextOffsetY !== session.cell.originOffsetY;
  const patch = buildCommitPatch(
    session,
    stickyTarget,
    nextOffsetX,
    nextOffsetY,
    clientX,
    day,
    metrics,
  );
  const hasChange = regionChanged || offsetXChanged || offsetYChanged;

  const colLeft = snap.columnOffsets[session.dayIndex] ?? 0;
  const sourceRegionTop = regionTopAt(snap, session.region);
  const ghostMatrixLeft = colLeft + CELL_PADDING + session.cell.baseX + nextOffsetX;

  let ghostMatrixTop: number;
  if (regionChanged) {
    const predicted = day
      ? predictNodePlacementInCell(day, stickyTarget, session.nodeId, metrics)
      : null;
    ghostMatrixTop =
      regionTopAt(snap, stickyTarget) + CELL_PADDING + (predicted?.y ?? 0);
  } else {
    ghostMatrixTop = sourceRegionTop + CELL_PADDING + session.cell.basePlaceY + nextOffsetY;
  }

  const ghostLocalDx = nextOffsetX - session.cell.originOffsetX;
  const ghostLocalDy = nextOffsetY - session.cell.originOffsetY;

  return {
    targetRegion: stickyTarget,
    stickyRegion: stickyTarget,
    hasChange,
    patch,
    preview: {
      nodeId: session.nodeId,
      dayIndex: session.dayIndex,
      sourceRegion: session.region,
      targetRegion: stickyTarget,
      dx: ghostLocalDx,
      useGhost: true,
      ghostMatrixLeft,
      ghostMatrixTop,
      ghostLocalDx,
      ghostLocalDy,
      ghostWidth: session.cell.nodeWidth,
      ghostHeight: session.cell.nodeHeight,
    },
  };
}

function initialPreview(session: DragSession): DragPreview {
  const snap = session.layoutSnapshot;
  const colLeft = snap.columnOffsets[session.dayIndex] ?? 0;
  const sourceRegionTop = regionTopAt(snap, session.region);
  const ghostMatrixLeft =
    colLeft + CELL_PADDING + session.cell.baseX + session.cell.originOffsetX;
  const ghostMatrixTop =
    sourceRegionTop + CELL_PADDING + session.cell.basePlaceY + session.cell.originOffsetY;

  return {
    nodeId: session.nodeId,
    dayIndex: session.dayIndex,
    sourceRegion: session.region,
    targetRegion: session.region,
    dx: 0,
    useGhost: true,
    ghostMatrixLeft,
    ghostMatrixTop,
    ghostLocalDx: 0,
    ghostLocalDy: 0,
    ghostWidth: session.cell.nodeWidth,
    ghostHeight: session.cell.nodeHeight,
  };
}

export function useOverviewNodeDrag({
  matrixRef,
  layout,
  days,
  metrics,
  onCommit,
}: UseOverviewNodeDragOptions) {
  const dragRef = useRef<DragSession | null>(null);
  const rafRef = useRef(0);
  const onCommitRef = useRef(onCommit);
  const layoutRef = useRef(layout);
  const daysRef = useRef(days);
  const metricsRef = useRef(metrics);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
    layoutRef.current = layout;
    daysRef.current = days;
    metricsRef.current = metrics;
  }, [onCommit, layout, days, metrics]);

  const releaseCapture = useCallback((session: DragSession) => {
    if (!session.captureEl) return;
    try {
      session.captureEl.releasePointerCapture(session.pointerId);
    } catch {
      /* ignore */
    }
    session.captureEl = null;
  }, []);

  const endDrag = useCallback(() => {
    const session = dragRef.current;
    if (session) releaseCapture(session);
    dragRef.current = null;
    setDragPreview(null);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, [releaseCapture]);

  const finishDrag = useCallback(
    (clientX: number, clientY: number, pointerId: number) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== pointerId) return;

      if (!session.activated) {
        endDrag();
        return;
      }

      const matrix = matrixRef.current;
      if (!matrix) {
        endDrag();
        return;
      }

      const day = daysRef.current[session.dayIndex];
      const frame = computeDragFrame(
        session,
        clientX,
        clientY,
        matrix,
        session.stickyTargetRegion,
        day,
        metricsRef.current,
      );

      if (!frame?.hasChange) {
        endDrag();
        return;
      }

      onCommitRef.current(session.dayIndex, session.nodeId, frame.patch);
      endDrag();
    },
    [matrixRef, endDrag],
  );

  const activateDrag = useCallback((session: DragSession) => {
    session.activated = true;
    session.stickyTargetRegion = session.region;
    session.layoutSnapshot = snapshotLayout(layoutRef.current);
    if (session.captureEl) {
      try {
        session.captureEl.setPointerCapture(session.pointerId);
      } catch {
        /* ignore */
      }
    }
    setDragPreview(initialPreview(session));
  }, []);

  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== e.pointerId) return;

      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;

      if (!session.activated) {
        if (!isDragActivated(dx, dy)) return;
        activateDrag(session);
      }

      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const active = dragRef.current;
        if (!active || active.pointerId !== e.pointerId || !active.activated) return;

        const matrix = matrixRef.current;
        if (!matrix) return;

        const day = daysRef.current[active.dayIndex];
        const frame = computeDragFrame(
          active,
          e.clientX,
          e.clientY,
          matrix,
          active.stickyTargetRegion,
          day,
          metricsRef.current,
        );

        if (!frame) {
          setDragPreview(initialPreview(active));
          return;
        }

        active.stickyTargetRegion = frame.stickyRegion;
        setDragPreview(frame.preview);
      });
    };

    const onWindowPointerUp = (e: PointerEvent) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
      finishDrag(e.clientX, e.clientY, e.pointerId);
    };

    const onWindowPointerCancel = (e: PointerEvent) => {
      if (dragRef.current?.pointerId === e.pointerId) endDrag();
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
    };
  }, [matrixRef, finishDrag, endDrag, activateDrag]);

  const onNodePointerDown = useCallback(
    (
      e: React.PointerEvent,
      nodeId: string,
      dayIndex: number,
      region: string,
      cell: NodeDragCellContext,
    ) => {
      if (e.button !== 0) return;

      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();

      dragRef.current = {
        nodeId,
        dayIndex,
        region,
        stickyTargetRegion: region,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        grabOffsetY: e.clientY - rect.top,
        activated: false,
        captureEl: el,
        layoutSnapshot: snapshotLayout(layoutRef.current),
        cell,
      };
    },
    [],
  );

  const onNodePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
      const session = dragRef.current;
      if (!session.activated) {
        endDrag();
        return;
      }
      e.preventDefault();
      finishDrag(e.clientX, e.clientY, e.pointerId);
    },
    [finishDrag, endDrag],
  );

  return {
    dragPreview,
    onNodePointerDown,
    onNodePointerUp,
  };
}
