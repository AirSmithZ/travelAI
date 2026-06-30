import type { CellEdgePlacement, CellNodePlacement } from './layoutOverview';
import type { ItineraryEdge } from '../types/itinerary';

export type OverviewEdgeSide = 'left' | 'right' | 'top' | 'bottom';

export interface OverviewConnection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sourceSide: OverviewEdgeSide;
  targetSide: OverviewEdgeSide;
}

/** 根据两节点实际位置计算连接点（与单程 TripEdge / xyflow 侧向一致） */
export function getNodeConnection(
  from: CellNodePlacement,
  to: CellNodePlacement,
): OverviewConnection {
  const fromCx = from.x + from.width / 2;
  const fromCy = from.y + from.height / 2;
  const toCx = to.x + to.width / 2;
  const toCy = to.y + to.height / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        x1: from.x + from.width,
        y1: fromCy,
        x2: to.x,
        y2: toCy,
        sourceSide: 'right',
        targetSide: 'left',
      };
    }
    return {
      x1: from.x,
      y1: fromCy,
      x2: to.x + to.width,
      y2: toCy,
      sourceSide: 'left',
      targetSide: 'right',
    };
  }

  if (dy >= 0) {
    return {
      x1: fromCx,
      y1: from.y + from.height,
      x2: toCx,
      y2: to.y,
      sourceSide: 'bottom',
      targetSide: 'top',
    };
  }
  return {
    x1: fromCx,
    y1: from.y,
    x2: toCx,
    y2: to.y + to.height,
    sourceSide: 'top',
    targetSide: 'bottom',
  };
}

export function overviewSideToPosition(side: OverviewEdgeSide): 'left' | 'right' | 'top' | 'bottom' {
  return side;
}

export interface DragOffsetPreview {
  nodeId: string;
  dx: number;
  dy: number;
}

export function applyDragToPlacement(
  placement: CellNodePlacement,
  dragPreview?: DragOffsetPreview | null,
): CellNodePlacement {
  if (!dragPreview || dragPreview.nodeId !== placement.nodeId) return placement;
  return {
    ...placement,
    x: placement.x + dragPreview.dx,
    y: placement.y + dragPreview.dy,
  };
}

export function connectionBetweenPlacements(
  from: CellNodePlacement,
  to: CellNodePlacement,
  edge: ItineraryEdge,
  dragPreview?: DragOffsetPreview | null,
): CellEdgePlacement {
  const conn = getNodeConnection(
    applyDragToPlacement(from, dragPreview),
    applyDragToPlacement(to, dragPreview),
  );
  return { edge, ...conn };
}
