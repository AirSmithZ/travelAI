import type { Itinerary, ItineraryEdge } from '../types/itinerary';
import { mockSingaporeItinerary } from '../data/mockSingapore';
import type { TripRequest } from '../types/tripRequest';

/** 按 day_count 截断 Mock 行程天数，并重映射 day_index */
export function buildMockItinerary(tripRequest: TripRequest): Itinerary {
  const dest = tripRequest.destination.trim() || '新加坡';
  const requestedDays = tripRequest.day_count;

  let days = mockSingaporeItinerary.days.map((d) => ({
    ...d,
    nodes: d.nodes.map((n) => ({ ...n })),
    edges: d.edges.map((e) => ({ ...e })),
  }));

  if (requestedDays != null && requestedDays > 0) {
    days = days.slice(0, requestedDays);
  }

  days = days.map((day, i) => ({
    ...day,
    day_index: i + 1,
  }));

  const keptNodeIds = new Set(days.flatMap((d) => d.nodes.map((n) => n.id)));

  const filterEdges = (edges: ItineraryEdge[]) =>
    edges.filter((e) => keptNodeIds.has(e.from) && keptNodeIds.has(e.to));

  days = days.map((day) => ({
    ...day,
    edges: filterEdges(day.edges),
  }));

  const cross_day_edges = (mockSingaporeItinerary.cross_day_edges ?? []).filter(
    (e) => keptNodeIds.has(e.from) && keptNodeIds.has(e.to),
  );

  const dayCountLabel = days.length;

  return {
    ...mockSingaporeItinerary,
    id: crypto.randomUUID(),
    destination: dest,
    title: `${dest} ${dayCountLabel} 日游`,
    days,
    cross_day_edges,
    meta: {
      ...mockSingaporeItinerary.meta,
      generated_at: new Date().toISOString(),
      warnings: [
        ...mockSingaporeItinerary.meta.warnings,
        ...(requestedDays && requestedDays < mockSingaporeItinerary.days.length
          ? [`Mock 已按 ${requestedDays} 天截断行程`]
          : []),
      ],
    },
  };
}
