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

function placeKey(node: ItineraryNode): string {
  return (node.name || '').trim().toLowerCase();
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

/** Partition a geo-cluster by place name (day-loop hotel morning/evening share one place). */
function partitionByPlace(group: ItineraryNode[]): ItineraryNode[][] {
  const byPlace = new Map<string, ItineraryNode[]>();
  for (const node of group) {
    const key = placeKey(node);
    const list = byPlace.get(key);
    if (list) list.push(node);
    else byPlace.set(key, [node]);
  }
  return [...byPlace.values()];
}

/**
 * 将「不同地点」却坐标重合/过近的节点按圆环散开，仅影响地图展示。
 * 同名同点（如日闭环首尾酒店）保持真实坐标，不散开、不标重合。
 */
export function spreadMapNodes(nodes: ItineraryNode[]): MapDisplayNode[] {
  const valid = nodes.filter(hasMapCoords);
  const groups = groupNearby(valid);
  const result: MapDisplayNode[] = [];

  for (const group of groups) {
    const places = partitionByPlace(group);

    // Single place (incl. hotel morning+evening): true coords
    if (places.length === 1) {
      for (const node of places[0]!) {
        result.push({
          ...node,
          displayLat: node.lat,
          displayLng: node.lng,
          overlapCount: 1,
        });
      }
      continue;
    }

    // Distinct places colliding — spread one slot per place
    const placeCount = places.length;
    const radiusDeg = 0.002 * (1 + Math.min(placeCount, 8) * 0.12);
    const cx = group.reduce((s, n) => s + n.lat, 0) / group.length;
    const cy = group.reduce((s, n) => s + n.lng, 0) / group.length;

    places.forEach((cluster, i) => {
      const angle = (2 * Math.PI * i) / placeCount - Math.PI / 2;
      const displayLat = cx + radiusDeg * Math.cos(angle);
      const displayLng = cy + radiusDeg * Math.sin(angle);
      for (const node of cluster) {
        result.push({
          ...node,
          displayLat,
          displayLng,
          overlapCount: placeCount,
        });
      }
    });
  }

  return result;
}

/** Count nodes that will be visually spread (distinct places colliding), not same-place stacks. */
export function countOverlappingNodes(nodes: ItineraryNode[]): number {
  const valid = nodes.filter(hasMapCoords);
  const groups = groupNearby(valid);
  let total = 0;
  for (const g of groups) {
    const places = partitionByPlace(g);
    if (places.length > 1) total += g.length;
  }
  return total;
}
