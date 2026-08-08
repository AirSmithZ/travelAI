import type { Itinerary, ItineraryNode } from '../types/itinerary';
import type { ConfirmedHotelStay, TravelIntel } from '../types/travelIntel';

/** B-P6-02: node ids that are primary / linked hotels for overview highlight */
export function primaryHotelNodeIds(
  itinerary: Itinerary | null | undefined,
  intel: TravelIntel,
): Set<string> {
  const ids = new Set<string>();
  for (const h of intel.hotels ?? []) {
    if (h.itinerary_node_id) ids.add(h.itinerary_node_id);
  }
  if (!itinerary) return ids;
  for (const day of itinerary.days) {
    for (const n of day.nodes) {
      if (n.category === 'hotel') ids.add(n.id);
    }
  }
  return ids;
}

export function hotelsCoveringDay(
  hotels: ConfirmedHotelStay[],
  dayDate: string | undefined,
): ConfirmedHotelStay[] {
  if (!dayDate) return hotels.filter((h) => h.is_primary);
  return hotels.filter((h) => {
    if (!h.check_in || !h.check_out) return h.is_primary;
    return h.check_in <= dayDate && dayDate < h.check_out;
  });
}

/** Soft warnings when overnight edges ignore confirmed primary hotel nodes */
export function overviewHotelAlignmentWarnings(
  itinerary: Itinerary | null | undefined,
  intel: TravelIntel,
): string[] {
  if (!itinerary?.days.length) return [];
  const hotels = intel.hotels ?? [];
  if (!hotels.length) return [];

  const hotelIds = primaryHotelNodeIds(itinerary, intel);
  const warnings: string[] = [];
  const cross = itinerary.cross_day_edges ?? [];

  for (const edge of cross) {
    const fromHotel = hotelIds.has(edge.from);
    const toHotel = hotelIds.has(edge.to);
    if (!fromHotel && !toHotel) {
      warnings.push(
        `跨天连线 ${edge.from}→${edge.to} 未经过已确认酒店节点，请核对过夜住宿`,
      );
    }
  }

  const primary = hotels.filter((h) => h.is_primary);
  for (const h of primary) {
    if (!h.itinerary_node_id) {
      warnings.push(`主酒店「${h.name}」尚未绑定路线图节点`);
    } else {
      let found: ItineraryNode | undefined;
      for (const d of itinerary.days) {
        found = d.nodes.find((n) => n.id === h.itinerary_node_id);
        if (found) break;
      }
      if (!found) {
        warnings.push(`主酒店「${h.name}」绑定节点已不在行程中`);
      }
    }
  }

  return warnings.slice(0, 3);
}
