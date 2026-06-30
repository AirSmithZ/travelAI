import type { DayPlan, ItineraryEdge, ItineraryNode } from '../types/itinerary';
import { getNodeRegion } from './nodeRegion';
import {
  buildCellRouteSegments,
  getIntraCellAlternativeEdges,
  getOrderedRegionNodes,
  groupRouteSegments,
} from './overviewRoute';
import { getNodeConnection, type OverviewEdgeSide } from './overviewEdgeGeometry';
import {
  COMPACT_NODE_HEIGHT,
  COMPACT_NODE_WIDTH,
  COMPACT_RANK_SEP,
  OVERVIEW_COMPACT_NODE_GAP,
  OVERVIEW_NODE_GAP,
  TRIP_NODE_HEIGHT,
  TRIP_NODE_WIDTH,
  TRIP_RANK_SEP,
} from './graphLayoutConstants';

export const REGION_RAIL_WIDTH = 96;
export const REGION_RAIL_WIDTH_MIN = 96;

/** 区域名换行展示，左轨固定宽度 */
export function getRegionRailWidth(_regions: string[]): number {
  return REGION_RAIL_WIDTH;
}
export const COLUMN_MIN_WIDTH = 280;
export const COMPACT_COLUMN_MIN_WIDTH = 240;
export const OVERVIEW_NODE_WIDTH = TRIP_NODE_WIDTH;
export const COMPACT_NODE_WIDTH_LEGACY = COMPACT_NODE_WIDTH;
export const OVERVIEW_NODE_HEIGHT = TRIP_NODE_HEIGHT;
export const COMPACT_NODE_HEIGHT_LEGACY = COMPACT_NODE_HEIGHT;
export const OVERVIEW_COMMUTE_WIDTH = TRIP_RANK_SEP;
export const COMPACT_COMMUTE_WIDTH = COMPACT_RANK_SEP;
export const OVERVIEW_COMPACT_THRESHOLD = 5;
export const COLUMN_HEADER_HEIGHT = 40;
export const CROSS_DAY_CHANNEL_HEIGHT = 20;
export const CELL_PADDING = 8;
export const EMPTY_CELL_HEIGHT = 180;
export const CELL_NOTE_HEIGHT = 36;
export const ALT_ROUTE_ROW_HEIGHT = 32;
export const SCENE_GROUP_PAD_X = 10;
export const SCENE_GROUP_PAD_TOP = 22;
export const SCENE_GROUP_TAIL = 14;

export const REGION_TINT_VARS = [
  '--region-tint-a',
  '--region-tint-b',
  '--region-tint-c',
] as const;

export interface CellNodePlacement {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellEdgePlacement {
  edge: ItineraryEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sourceSide: OverviewEdgeSide;
  targetSide: OverviewEdgeSide;
}

export interface CellLayoutResult {
  placements: Map<string, CellNodePlacement>;
  edgePlacements: CellEdgePlacement[];
  altEdgePlacements: CellEdgePlacement[];
  width: number;
  height: number;
}

export function collectRegionsInOrder(days: DayPlan[]): string[] {
  const seen = new Set<string>();
  const regions: string[] = [];

  const add = (raw: string | undefined) => {
    const r = raw?.trim();
    if (!r || seen.has(r)) return;
    seen.add(r);
    regions.push(r);
  };

  // 先按天序收集 day.region，左侧轨顺序稳定，空区也占位
  days.forEach((day) => add(day.region));
  // 再补充节点中出现的其他区域
  days.forEach((day) => {
    day.nodes.forEach((node) => add(getNodeRegion(node, day)));
  });

  if (regions.length === 0) regions.push('其他');
  return regions;
}

export interface OverviewCellData {
  dayIndex: number;
  region: string;
  nodes: ItineraryNode[];
  contentWidth: number;
  contentHeight: number;
  cellLayout: CellLayoutResult;
}

export interface OverviewLayout {
  regions: string[];
  regionHeights: Map<string, number>;
  cells: OverviewCellData[];
  columnWidths: number[];
  columnOffsets: number[];
  railWidth: number;
  width: number;
  height: number;
  columnWidth: number;
}

export function cellKey(dayIndex: number, region: string): string {
  return `${dayIndex}:${region}`;
}

export interface OverviewMetrics {
  minColumnWidth: number;
  nodeWidth: number;
  nodeHeight: number;
  commuteWidth: number;
  nodeGap: number;
  compact: boolean;
  virtualize: boolean;
  columnWidth: number;
}

export function getOverviewMetrics(dayCount: number): OverviewMetrics {
  const compact = dayCount > OVERVIEW_COMPACT_THRESHOLD;
  const minColumnWidth = compact ? COMPACT_COLUMN_MIN_WIDTH : COLUMN_MIN_WIDTH;
  return {
    minColumnWidth,
    columnWidth: minColumnWidth,
    nodeWidth: compact ? COMPACT_NODE_WIDTH : TRIP_NODE_WIDTH,
    nodeHeight: compact ? COMPACT_NODE_HEIGHT : TRIP_NODE_HEIGHT,
    commuteWidth: compact ? COMPACT_RANK_SEP : TRIP_RANK_SEP,
    nodeGap: compact ? OVERVIEW_COMPACT_NODE_GAP : OVERVIEW_NODE_GAP,
    compact,
    virtualize: compact,
  };
}

function nodeOffset(node: ItineraryNode): { x: number; y: number } {
  const raw = node.overview_offset ?? { x: 0, y: 0 };
  return { x: raw.x, y: raw.y ?? 0 };
}

function collectIntraCellEdgePlacements(
  day: DayPlan,
  nodeIds: Set<string>,
  placements: Map<string, CellNodePlacement>,
): CellEdgePlacement[] {
  const result: CellEdgePlacement[] = [];
  for (const edge of day.edges) {
    if (edge.type !== 'primary') continue;
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    const fromP = placements.get(edge.from);
    const toP = placements.get(edge.to);
    if (!fromP || !toP) continue;
    const conn = getNodeConnection(fromP, toP);
    result.push({ edge, ...conn });
  }
  return result;
}

/** 单元格内节点绝对坐标 + 边界（含 overview_offset） */
export function computeCellLayout(
  day: DayPlan,
  nodes: ItineraryNode[],
  metrics: OverviewMetrics,
): CellLayoutResult {
  if (nodes.length === 0) {
    return {
      placements: new Map(),
      edgePlacements: [],
      altEdgePlacements: [],
      width: metrics.minColumnWidth,
      height: EMPTY_CELL_HEIGHT,
    };
  }

  const segments = buildCellRouteSegments(day, nodes);
  const blocks = groupRouteSegments(segments);
  const placements = new Map<string, CellNodePlacement>();

  let cursorX = 0;

  for (const block of blocks) {
    const padLeft = block.label ? SCENE_GROUP_PAD_X : 0;
    const padTop = block.label ? SCENE_GROUP_PAD_TOP : 0;
    let bx = cursorX + padLeft;

    for (let i = 0; i < block.segments.length; i += 1) {
      const seg = block.segments[i];
      const offset = nodeOffset(seg.node);
      const placement = {
        nodeId: seg.node.id,
        x: bx + offset.x,
        y: padTop + offset.y,
        width: metrics.nodeWidth,
        height: metrics.nodeHeight,
      };
      placements.set(seg.node.id, placement);

      bx += metrics.nodeWidth;
      if (i < block.segments.length - 1) bx += metrics.commuteWidth + metrics.nodeGap;
    }

    cursorX = bx + (block.label ? SCENE_GROUP_TAIL : 0) + 4;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edgePlacements = collectIntraCellEdgePlacements(day, nodeIds, placements);

  const altEdgePlacements: CellEdgePlacement[] = [];
  for (const edge of getIntraCellAlternativeEdges(day, nodes)) {
    const fromP = placements.get(edge.from);
    const toP = placements.get(edge.to);
    if (!fromP || !toP) continue;
    altEdgePlacements.push({ edge, ...getNodeConnection(fromP, toP) });
  }

  let maxX = 0;
  let maxY = 0;
  placements.forEach((p) => {
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  });

  for (const ep of edgePlacements) {
    maxX = Math.max(maxX, ep.x1, ep.x2);
    maxY = Math.max(maxY, ep.y1, ep.y2);
  }
  for (const ep of altEdgePlacements) {
    maxX = Math.max(maxX, ep.x1, ep.x2);
    maxY = Math.max(maxY, ep.y1, ep.y2);
  }

  const tipsLen = nodes.flatMap((n) => n.tips ?? []).join(' ').length;
  if (tipsLen > 40) maxY += CELL_NOTE_HEIGHT + 4;

  return {
    placements,
    edgePlacements,
    altEdgePlacements,
    width: Math.max(metrics.minColumnWidth, maxX + CELL_PADDING * 2),
    height: Math.max(EMPTY_CELL_HEIGHT, maxY + CELL_PADDING * 2),
  };
}

export function layoutOverview(
  days: DayPlan[],
  metrics?: OverviewMetrics,
  columnMinWidths?: number[],
): OverviewLayout {
  const m = metrics ?? getOverviewMetrics(days.length);
  const regions = collectRegionsInOrder(days);
  const regionHeights = new Map<string, number>();
  const cells: OverviewCellData[] = [];
  const columnWidths = new Array<number>(days.length).fill(m.minColumnWidth);

  for (const region of regions) {
    let maxH = EMPTY_CELL_HEIGHT;
    days.forEach((day, dayIndex) => {
      const nodes = getOrderedRegionNodes(
        day,
        day.nodes.filter((n) => getNodeRegion(n, day) === region),
      );
      const cellLayout = computeCellLayout(day, nodes, m);
      cells.push({
        dayIndex,
        region,
        nodes,
        contentWidth: cellLayout.width,
        contentHeight: cellLayout.height,
        cellLayout,
      });
      maxH = Math.max(maxH, cellLayout.height);
      const userMin = columnMinWidths?.[dayIndex] ?? 0;
      columnWidths[dayIndex] = Math.max(
        columnWidths[dayIndex],
        cellLayout.width,
        userMin > 0 ? userMin : m.minColumnWidth,
      );
    });
    regionHeights.set(region, maxH);
  }

  const columnOffsets: number[] = [];
  let offset = 0;
  for (let i = 0; i < days.length; i += 1) {
    columnOffsets.push(offset);
    offset += columnWidths[i];
  }

  const matrixWidth = offset;
  const regionStackHeight = [...regionHeights.values()].reduce((a, b) => a + b, 0);
  const railWidth = getRegionRailWidth(regions);
  const width = railWidth + matrixWidth;
  const height = COLUMN_HEADER_HEIGHT + regionStackHeight;
  const columnWidth = Math.max(...columnWidths, m.minColumnWidth);

  return {
    regions,
    regionHeights,
    cells,
    columnWidths,
    columnOffsets,
    railWidth,
    width,
    height,
    columnWidth,
  };
}

/** 矩阵绝对坐标下的节点边框盒（复用 layout.cells，不二次 computeCellLayout） */
export function computeOverviewMatrixPlacements(
  layout: OverviewLayout,
): Map<string, CellNodePlacement> {
  const matrixPlacements = new Map<string, CellNodePlacement>();
  let regionTop = 0;

  for (const region of layout.regions) {
    for (const cell of layout.cells) {
      if (cell.region !== region) continue;

      const cellLeft = layout.columnOffsets[cell.dayIndex] + CELL_PADDING;
      const cellTop = regionTop + CELL_PADDING;

      cell.cellLayout.placements.forEach((p, nodeId) => {
        matrixPlacements.set(nodeId, {
          ...p,
          x: cellLeft + p.x,
          y: cellTop + p.y,
        });
      });
    }

    regionTop += layout.regionHeights.get(region) ?? EMPTY_CELL_HEIGHT;
  }

  return matrixPlacements;
}

/** 预测节点换区后在目标单元格内的布局位置（不含 overview_offset） */
export function predictNodePlacementInCell(
  day: DayPlan,
  targetRegion: string,
  nodeId: string,
  metrics: OverviewMetrics,
): CellNodePlacement | null {
  const node = day.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const hypothetical = { ...node, region: targetRegion, overview_offset: undefined };
  const others = day.nodes.filter(
    (n) => n.id !== nodeId && getNodeRegion(n, day) === targetRegion,
  );
  const ordered = getOrderedRegionNodes(day, [...others, hypothetical]);
  const cellLayout = computeCellLayout(day, ordered, metrics);
  const place = cellLayout.placements.get(nodeId);
  if (!place) return null;
  return { ...place, nodeId };
}

/** @deprecated 使用 predictNodePlacementInCell */
export function predictNodeBaseXInCell(
  day: DayPlan,
  targetRegion: string,
  nodeId: string,
  metrics: OverviewMetrics,
): number | null {
  return predictNodePlacementInCell(day, targetRegion, nodeId, metrics)?.x ?? null;
}

export function getRegionTintVar(regionIndex: number): string {
  return REGION_TINT_VARS[regionIndex % REGION_TINT_VARS.length];
}
