import type { ItineraryNode } from '../types/itinerary';
import { hasMapCoords } from './mapCoords';

/** 地图上用于展示的节点（可能与真实坐标略有偏移以避免重叠） */
export type MapDisplayNode = ItineraryNode & {
  displayLat: number;
  displayLng: number;
  overlapCount: number;
};

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** 将重合坐标的节点按小圆环散开，仅影响地图展示，不改写数据 */
export function spreadMapNodes(nodes: ItineraryNode[]): MapDisplayNode[] {
  const valid = nodes.filter(hasMapCoords);
  const groups = new Map<string, ItineraryNode[]>();

  for (const node of valid) {
    const key = coordKey(node.lat, node.lng);
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  const result: MapDisplayNode[] = [];

  for (const group of groups.values()) {
    const overlapCount = group.length;
    if (overlapCount === 1) {
      const node = group[0];
      result.push({
        ...node,
        displayLat: node.lat,
        displayLng: node.lng,
        overlapCount: 1,
      });
      continue;
    }

    // ~60m 半径，随重叠数量略放大
    const radiusDeg = 0.00055 * (1 + Math.min(overlapCount, 6) * 0.08);
    group.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / overlapCount - Math.PI / 2;
      result.push({
        ...node,
        displayLat: node.lat + radiusDeg * Math.cos(angle),
        displayLng: node.lng + radiusDeg * Math.sin(angle),
        overlapCount,
      });
    });
  }

  return result;
}

export function countOverlappingNodes(nodes: ItineraryNode[]): number {
  const valid = nodes.filter(hasMapCoords);
  const groups = new Map<string, number>();
  for (const node of valid) {
    const key = coordKey(node.lat, node.lng);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  let total = 0;
  for (const n of groups.values()) {
    if (n > 1) total += n;
  }
  return total;
}
