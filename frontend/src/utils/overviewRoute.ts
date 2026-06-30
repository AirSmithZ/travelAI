import type { DayPlan, ItineraryEdge, ItineraryNode } from '../types/itinerary';
import { getNodeRegion } from './nodeRegion';
import { sortNodesByPrimaryEdges } from './edgeMutations';

export interface RouteSegment {
  node: ItineraryNode;
  edgeToNext?: ItineraryEdge;
}

export interface SceneGroupBlock {
  label: string;
  segments: RouteSegment[];
}

/** 单元格内节点按全天 primary 拓扑序过滤，与单程图一致 */
export function getOrderedRegionNodes(
  day: DayPlan,
  regionNodes: ItineraryNode[],
): ItineraryNode[] {
  const ids = new Set(regionNodes.map((n) => n.id));
  const dayOrder = sortNodesByPrimaryEdges(day.nodes, day.edges);
  return dayOrder.filter((n) => ids.has(n.id));
}

/** 单元格内按全天 primary 序的水平路线段（与单程 ItineraryGraph 同源排序） */
export function buildCellRouteSegments(
  day: DayPlan,
  regionNodes: ItineraryNode[],
): RouteSegment[] {
  const ordered = getOrderedRegionNodes(day, regionNodes);
  return ordered.map((node, idx) => {
    const next = ordered[idx + 1];
    const edge = next ? findEdgeBetween(day, node.id, next.id) : undefined;
    return { node, edgeToNext: edge };
  });
}

export function findEdgeBetween(
  day: DayPlan,
  from: string,
  to: string,
): ItineraryEdge | undefined {
  const primary = day.edges.find(
    (e) => e.from === from && e.to === to && e.type === 'primary',
  );
  if (primary) return primary;
  return day.edges.find((e) => e.from === from && e.to === to);
}

/** 按 scene_group 将路线段分组；同组 ≥2 节点才显示虚线框 */
export function groupRouteSegments(segments: RouteSegment[]): SceneGroupBlock[] {
  const blocks: SceneGroupBlock[] = [];
  let groupLabel = '';
  let groupSegments: RouteSegment[] = [];

  const flushGroup = () => {
    if (groupSegments.length === 0) return;
    blocks.push({
      label: groupLabel && groupSegments.length >= 2 ? groupLabel : '',
      segments: [...groupSegments],
    });
    groupSegments = [];
    groupLabel = '';
  };

  for (const seg of segments) {
    const label = seg.node.scene_group?.trim() ?? '';
    if (label) {
      if (groupLabel === label) {
        groupSegments.push(seg);
      } else {
        flushGroup();
        groupLabel = label;
        groupSegments = [seg];
      }
    } else {
      flushGroup();
      blocks.push({ label: '', segments: [seg] });
    }
  }

  flushGroup();
  return blocks;
}

/** 同天跨区域的边（总览 SVG 层绘制） */
export function getCrossRegionEdges(day: DayPlan): ItineraryEdge[] {
  const regionOf = (id: string) => {
    const node = day.nodes.find((n) => n.id === id);
    return node ? getNodeRegion(node, day) : null;
  };

  return day.edges.filter((e) => {
    const fromR = regionOf(e.from);
    const toR = regionOf(e.to);
    return fromR && toR && fromR !== toR;
  });
}

/** 单元格内备选边（主链之外的边，两端都在本格节点内） */
export function getIntraCellAlternativeEdges(
  day: DayPlan,
  regionNodes: ItineraryNode[],
): ItineraryEdge[] {
  const ids = new Set(regionNodes.map((n) => n.id));
  const primaryPairs = new Set<string>();
  const segments = buildCellRouteSegments(day, regionNodes);
  for (const seg of segments) {
    if (seg.edgeToNext) {
      primaryPairs.add(`${seg.node.id}->${seg.edgeToNext.to}`);
    }
  }

  return day.edges.filter((e) => {
    if (!ids.has(e.from) || !ids.has(e.to)) return false;
    if (primaryPairs.has(`${e.from}->${e.to}`)) return false;
    return e.type === 'alternative';
  });
}

/** 单元格级长说明：合并 tips 超过阈值时展示 */
export function getCellLongNote(nodes: ItineraryNode[]): string | null {
  const combined = nodes
    .flatMap((n) => n.tips ?? [])
    .filter(Boolean)
    .join(' ');
  if (combined.length > 40) return combined;
  return null;
}
