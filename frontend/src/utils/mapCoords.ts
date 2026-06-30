import type { ItineraryNode } from '../types/itinerary';

/** 节点是否可在地图上展示（排除占位 0,0 与非法数值） */
export function hasMapCoords(node: Pick<ItineraryNode, 'lat' | 'lng'>): boolean {
  const { lat, lng } = node;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}
