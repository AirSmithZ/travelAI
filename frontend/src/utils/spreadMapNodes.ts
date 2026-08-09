import type { ItineraryNode } from '../types/itinerary';
import { hasMapCoords } from './mapCoords';

/** 地图上用于展示的节点（可能与真实坐标略有偏移以避免重叠） */
export type MapDisplayNode = ItineraryNode & {
  displayLat: number;
  displayLng: number;
  overlapCount: number;
};

/** ~120m — treat as same pin for spread (geocode often differs by meters) */
const NEAR_M = 120;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Greedy cluster of nodes within NEAR_M */
function groupNearby(nodes: ItineraryNode[]): ItineraryNode[][] {
  const remaining = [...nodes];
  const groups: ItineraryNode[][] = [];
  while (remaining.length) {
    const seed = remaining.shift()!;
    const group = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const n = remaining[i]!;
      if (haversineM(seed.lat, seed.lng, n.lat, n.lng) <= NEAR_M) {
        group.push(n);
        remaining.splice(i, 1);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** 将重合/过近坐标的节点按圆环散开，仅影响地图展示，不改写数据 */
export function spreadMapNodes(nodes: ItineraryNode[]): MapDisplayNode[] {
  const valid = nodes.filter(hasMapCoords);
  const groups = groupNearby(valid);
  const result: MapDisplayNode[] = [];

  for (const group of groups) {
    const overlapCount = group.length;
    if (overlapCount === 1) {
      const node = group[0]!;
      result.push({
        ...node,
        displayLat: node.lat,
        displayLng: node.lng,
        overlapCount: 1,
      });
      continue;
    }

    // ~220m 半径，随重叠放大，避免 fit zoom 下仍像一个点
    const radiusDeg = 0.002 * (1 + Math.min(overlapCount, 8) * 0.12);
    const cx = group.reduce((s, n) => s + n.lat, 0) / overlapCount;
    const cy = group.reduce((s, n) => s + n.lng, 0) / overlapCount;
    group.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / overlapCount - Math.PI / 2;
      result.push({
        ...node,
        displayLat: cx + radiusDeg * Math.cos(angle),
        displayLng: cy + radiusDeg * Math.sin(angle),
        overlapCount,
      });
    });
  }

  return result;
}

export function countOverlappingNodes(nodes: ItineraryNode[]): number {
  const valid = nodes.filter(hasMapCoords);
  const groups = groupNearby(valid);
  let total = 0;
  for (const g of groups) {
    if (g.length > 1) total += g.length;
  }
  return total;
}
