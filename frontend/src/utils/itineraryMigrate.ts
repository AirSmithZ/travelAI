import type { Itinerary, ItineraryEdge } from '../types/itinerary';
import { mockSingaporeItinerary } from '../data/mockSingapore';

/** 为缺少 cross_day_edges 的旧 itinerary 补全跨日连线 */
export function migrateItineraryCrossDayEdges(itinerary: Itinerary): Itinerary {
  if (itinerary.cross_day_edges && itinerary.cross_day_edges.length > 0) {
    return itinerary;
  }

  const nodeIds = new Set(itinerary.days.flatMap((d) => d.nodes.map((n) => n.id)));

  const fromTemplate = (mockSingaporeItinerary.cross_day_edges ?? []).filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
  );
  if (fromTemplate.length > 0) {
    return { ...itinerary, cross_day_edges: fromTemplate };
  }

  const synthesized: ItineraryEdge[] = [];
  for (let i = 0; i < itinerary.days.length - 1; i++) {
    const fromDay = itinerary.days[i];
    const toDay = itinerary.days[i + 1];
    const fromNode = fromDay.nodes[fromDay.nodes.length - 1];
    const toNode = toDay.nodes[0];
    if (!fromNode || !toNode) continue;

    synthesized.push({
      id: `xd-mig-${i + 1}`,
      from: fromNode.id,
      to: toNode.id,
      type: 'primary',
      transport_mode: 'walk',
      duration_minutes: 0,
      label: '跨日衔接',
    });
  }

  return synthesized.length > 0
    ? { ...itinerary, cross_day_edges: synthesized }
    : itinerary;
}
