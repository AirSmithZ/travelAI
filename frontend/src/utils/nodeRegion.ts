import type { DayPlan, Itinerary, ItineraryNode } from '../types/itinerary';

const FALLBACK_REGION = '其他';

export function getNodeRegion(node: ItineraryNode, day: DayPlan): string {
  return node.region?.trim() || day.region?.trim() || FALLBACK_REGION;
}

/** 确保每个节点都有显式 region（写入时用于持久化） */
export function ensureDayNodeRegions(day: DayPlan): DayPlan {
  const defaultRegion = day.region?.trim() || FALLBACK_REGION;
  return {
    ...day,
    nodes: day.nodes.map((node) => {
      const offset = node.overview_offset;
      return {
        ...node,
        region: node.region?.trim() || defaultRegion,
        overview_offset: offset ? { x: offset.x, y: offset.y ?? 0 } : undefined,
      };
    }),
  };
}

export function ensureItineraryNodeRegions(itinerary: Itinerary): Itinerary {
  return {
    ...itinerary,
    days: itinerary.days.map(ensureDayNodeRegions),
  };
}
