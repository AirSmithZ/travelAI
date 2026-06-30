import type { Itinerary } from '../types/itinerary';

/** supplement parse 请求用：仅保留 LLM 上下文所需字段，减小 payload（P80） */
export function compactItineraryForParse(itinerary: Itinerary): Record<string, unknown> {
  return {
    id: itinerary.id,
    title: itinerary.title,
    destination: itinerary.destination,
    days: itinerary.days.map((day) => ({
      day_index: day.day_index,
      label: day.label,
      region: day.region,
      nodes: day.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        category: n.category,
        start_time: n.start_time,
        end_time: n.end_time,
        is_optional: n.is_optional,
        region: n.region,
      })),
      edges: day.edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        type: e.type,
        transport_mode: e.transport_mode,
        duration_minutes: e.duration_minutes,
        label: e.label,
      })),
    })),
    cross_day_edges: (itinerary.cross_day_edges ?? []).map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      transport_mode: e.transport_mode,
      duration_minutes: e.duration_minutes,
      label: e.label,
    })),
  };
}
