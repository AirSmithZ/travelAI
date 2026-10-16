import type { DayPlan, ItineraryEdge, ItineraryNode } from '../types/itinerary';
import { estimateCommuteChipWidth, spreadEdgeCaption } from './commuteLabels';
import { formatNodeCost } from './formatNodeCost';
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
  OVERVIEW_COMPACT_MIN_NODE_H_GAP,
  OVERVIEW_COMPACT_NODE_GAP,
  OVERVIEW_MIN_NODE_H_GAP,
  OVERVIEW_NODE_GAP,
  TRIP_NODE_HEIGHT,
  TRIP_NODE_WIDTH,
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
/** 总览通勤通道宽度（= 最小左右净空） */
export const OVERVIEW_COMMUTE_WIDTH = OVERVIEW_MIN_NODE_H_GAP;
export const COMPACT_COMMUTE_WIDTH = OVERVIEW_COMPACT_MIN_NODE_H_GAP;
export const OVERVIEW_COMPACT_THRESHOLD = 5;
/** 日期列头两行：日期星期，以及国家 · 城市 / 当日特色 */
export const COLUMN_HEADER_HEIGHT = 56;
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

/** 相邻节点卡片边到边的水平净空（通勤信息通道） */
export function overviewNodeHGap(metrics: OverviewMetrics): number {
  return metrics.commuteWidth + metrics.nodeGap;
}

export interface CellLayoutOptions {
  /** 展开排列：横向缝按连线文字加宽，加油站改成三排，分叉按卡片内容加高。拖拽偏移仍叠在这个位置上。 */
  spread?: boolean;
}

function placementOffset(node: ItineraryNode): { x: number; y: number } {
  return nodeOffset(node);
}

/** 分叉连线竖向通道，要能放下横向胶囊，且不压到上下两张卡。 */
const FORK_LABEL_LANE = 56;

/** 展开后加油站固定三排，不足三张时有几张排几排。 */
const FUEL_SPREAD_ROWS = 3;
const FUEL_GRID_GAP_X = 16;
const FUEL_GRID_GAP_Y = 12;

/** 把 n 张卡尽量均分到 rows 排，靠前的排多一张。 */
function fuelRowCounts(count: number, rows: number): number[] {
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

/** 胶囊左右各留的空隙。缝宽 = 这段文字的宽度 + 这段边距，短句窄、长句宽。 */
const SPREAD_LABEL_PAD = 40;

/**
 * 展开时上下错开的幅度。差值小于左右间距，连线仍从卡片侧面进出，
 * 曲线中段给标签留出位置，避免整条链贴在同一水平线上。
 */
const SPREAD_WAVE_Y = [0, 34, 16, 52, 8, 40, 22, 46];

function spreadWaveY(index: number): number {
  return SPREAD_WAVE_Y[index % SPREAD_WAVE_Y.length];
}

/** 展开排列时，这段连线需要的左右净空，按将要画出的文字宽度计算。 */
function spreadHGap(edge: ItineraryEdge | undefined): number {
  if (!edge) return SPREAD_LABEL_PAD + 16;
  return estimateCommuteChipWidth(spreadEdgeCaption(edge)) + SPREAD_LABEL_PAD;
}

function nameLineCount(name: string, innerWidth: number, fontSize: number): number {
  const cjk = fontSize;
  const latin = fontSize * 0.55;
  let width = 0;
  let lines = 1;
  for (const ch of name.trim() || ' ') {
    const w = ch.charCodeAt(0) > 127 ? cjk : latin;
    if (width + w > innerWidth && width > 0) {
      lines += 1;
      width = w;
    } else {
      width += w;
    }
  }
  return lines;
}

/** 总览卡片可见高度。紧凑模式不画 tips / tags。 */
export function estimateOverviewCardHeight(node: ItineraryNode, metrics: OverviewMetrics): number {
  const compact = metrics.compact;
  const fontSize = compact ? 12 : 13;
  const innerWidth = metrics.nodeWidth - (compact ? 16 : 24);
  const lines = nameLineCount(node.name, innerWidth, fontSize);
  let height = (compact ? 3 : 4) + (compact ? 12 : 20) + (compact ? 18 : 26);
  height += lines * (compact ? 17 : 18);
  if (node.start_time) height += compact ? 15 : 18;
  const cost = formatNodeCost(node);
  if (cost) {
    const costSize = compact ? 9 : 10;
    const costLines = nameLineCount(cost, innerWidth, costSize);
    height += 2 + costLines * (compact ? 14 : 16);
  }
  if (!compact && (node.tags?.length ?? 0) > 0) height += 20;
  if (!compact && (node.tips?.length ?? 0) > 0) height += 32;
  // 多留一行边，避免折行站名或边框比估算略高时再次贴上
  return Math.max(metrics.nodeHeight, Math.ceil(height) + 8);
}

export function getOverviewMetrics(dayCount: number): OverviewMetrics {
  const compact = dayCount > OVERVIEW_COMPACT_THRESHOLD;
  const minColumnWidth = compact ? COMPACT_COLUMN_MIN_WIDTH : COLUMN_MIN_WIDTH;
  return {
    minColumnWidth,
    columnWidth: minColumnWidth,
    nodeWidth: compact ? COMPACT_NODE_WIDTH : TRIP_NODE_WIDTH,
    nodeHeight: compact ? COMPACT_NODE_HEIGHT : TRIP_NODE_HEIGHT,
    commuteWidth: compact ? OVERVIEW_COMPACT_MIN_NODE_H_GAP : OVERVIEW_MIN_NODE_H_GAP,
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

/**
 * 分叉尽头：父节点有多条主路，其中可选且没有后续主路的节点。
 * 它们不插入主链，否则另一条主路的标签会穿过这张卡片。
 */
function collectForkSpurs(day: DayPlan, nodes: ItineraryNode[]): Map<string, string> {
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const primary = day.edges.filter(
    (e) => e.type === 'primary' && ids.has(e.from) && ids.has(e.to),
  );
  const outs = new Map<string, ItineraryEdge[]>();
  const outCount = new Map<string, number>();
  for (const edge of primary) {
    const list = outs.get(edge.from) ?? [];
    list.push(edge);
    outs.set(edge.from, list);
    outCount.set(edge.from, (outCount.get(edge.from) ?? 0) + 1);
  }

  const spurs = new Map<string, string>();
  for (const [from, edges] of outs) {
    if (edges.length < 2) continue;
    const side = edges.filter((edge) => {
      const node = byId.get(edge.to);
      return Boolean(node?.is_optional) && (outCount.get(edge.to) ?? 0) === 0;
    });
    if (side.length === 0 || side.length === edges.length) continue;
    for (const edge of side) spurs.set(edge.to, from);
  }
  return spurs;
}

/** 单元格内节点绝对坐标 + 边界（含 overview_offset） */
export function computeCellLayout(
  day: DayPlan,
  nodes: ItineraryNode[],
  metrics: OverviewMetrics,
  options?: CellLayoutOptions,
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

  const spurParents = collectForkSpurs(day, nodes);
  const spineNodes = nodes.filter((node) => !spurParents.has(node.id));
  const segments = buildCellRouteSegments(day, spineNodes);
  const blocks = groupRouteSegments(segments);
  const placements = new Map<string, CellNodePlacement>();
  const hGap = overviewNodeHGap(metrics);
  const spread = Boolean(options?.spread);

  let cursorX = 0;
  let routeIndex = 0;

  for (const block of blocks) {
    const padLeft = block.label ? SCENE_GROUP_PAD_X : 0;
    const padTop = block.label ? SCENE_GROUP_PAD_TOP : 0;
    if (block.label.startsWith('加油站')) {
      const originX = cursorX + padLeft;
      if (spread && block.segments.length > 1) {
        const rowCount = Math.min(FUEL_SPREAD_ROWS, block.segments.length);
        const counts = fuelRowCounts(block.segments.length, rowCount);
        const rowHeights = counts.map(() => 0);
        let index = 0;
        for (let row = 0; row < counts.length; row += 1) {
          for (let col = 0; col < counts[row]; col += 1) {
            const cardH = estimateOverviewCardHeight(block.segments[index].node, metrics);
            rowHeights[row] = Math.max(rowHeights[row], cardH);
            index += 1;
          }
        }
        const rowTops: number[] = [];
        let yCursor = padTop;
        for (let row = 0; row < rowCount; row += 1) {
          rowTops.push(yCursor);
          yCursor += rowHeights[row] + FUEL_GRID_GAP_Y;
        }
        index = 0;
        let maxRight = originX;
        for (let row = 0; row < counts.length; row += 1) {
          for (let col = 0; col < counts[row]; col += 1) {
            const seg = block.segments[index];
            const offset = placementOffset(seg.node);
            const cardH = estimateOverviewCardHeight(seg.node, metrics);
            const x = originX + col * (metrics.nodeWidth + FUEL_GRID_GAP_X) + offset.x;
            placements.set(seg.node.id, {
              nodeId: seg.node.id,
              x,
              y: rowTops[row] + offset.y,
              width: metrics.nodeWidth,
              height: cardH,
            });
            maxRight = Math.max(maxRight, x + metrics.nodeWidth);
            index += 1;
          }
        }
        const widest = Math.max(...counts);
        const gridRight = originX + (widest - 1) * (metrics.nodeWidth + FUEL_GRID_GAP_X) + metrics.nodeWidth;
        cursorX = Math.max(gridRight, maxRight) + SCENE_GROUP_TAIL + 4;
        continue;
      }
      let y = padTop;
      for (const seg of block.segments) {
        const offset = placementOffset(seg.node);
        const cardH = metrics.nodeHeight;
        placements.set(seg.node.id, {
          nodeId: seg.node.id,
          x: originX + offset.x,
          y: y + offset.y,
          width: metrics.nodeWidth,
          height: cardH,
        });
        y += cardH + 8;
      }
      cursorX = originX + metrics.nodeWidth + SCENE_GROUP_TAIL + 4;
      continue;
    }
    let bx = cursorX + padLeft;

    for (let i = 0; i < block.segments.length; i += 1) {
      const seg = block.segments[i];
      const offset = placementOffset(seg.node);
      const gap = spread ? spreadHGap(i > 0 ? block.segments[i - 1].edgeToNext : undefined) : hGap;
      const wave = spread ? spreadWaveY(routeIndex) : 0;
      routeIndex += 1;
      // offset 为偏好位移；与前序节点之间仍强制保留最小左右净空，避免通勤标签被挡住
      let x = bx + offset.x;
      if (i > 0) {
        const prev = placements.get(block.segments[i - 1].node.id);
        if (prev) x = Math.max(x, prev.x + prev.width + gap);
      }
      const placement = {
        nodeId: seg.node.id,
        x,
        y: padTop + wave + offset.y,
        width: metrics.nodeWidth,
        height: spread ? estimateOverviewCardHeight(seg.node, metrics) : metrics.nodeHeight,
      };
      placements.set(seg.node.id, placement);

      const hasNext = i < block.segments.length - 1;
      const nextGap = spread ? spreadHGap(seg.edgeToNext) : hGap;
      bx = x + metrics.nodeWidth + (hasNext ? nextGap : 0);
    }

    const tail = block.label ? SCENE_GROUP_TAIL : 0;
    const exitEdge = block.segments[block.segments.length - 1]?.edgeToNext;
    // 无 scene_group 的节点各自成块，块与块之间原先只有 4px。展开时按出口那条边的文字留缝。
    const between = spread && exitEdge ? spreadHGap(exitEdge) : 4;
    cursorX = bx + tail + between;
  }

  const spursByParent = new Map<string, string[]>();
  for (const [spurId, parentId] of spurParents) {
    const list = spursByParent.get(parentId) ?? [];
    list.push(spurId);
    spursByParent.set(parentId, list);
  }
  for (const [parentId, spurIds] of spursByParent) {
    const parent = placements.get(parentId);
    if (!parent) continue;
    let y = parent.y + parent.height + FORK_LABEL_LANE;
    for (const spurId of spurIds) {
      const spurNode = nodes.find((node) => node.id === spurId);
      if (!spurNode) continue;
      const offset = placementOffset(spurNode);
      const cardH = spread ? estimateOverviewCardHeight(spurNode, metrics) : metrics.nodeHeight;
      placements.set(spurId, {
        nodeId: spurId,
        x: parent.x + offset.x,
        y: y + offset.y,
        width: metrics.nodeWidth,
        height: cardH,
      });
      y += cardH + FORK_LABEL_LANE;
    }
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
  options?: CellLayoutOptions,
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
      const cellLayout = computeCellLayout(day, nodes, m, options);
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
