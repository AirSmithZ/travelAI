import type { ItineraryNode } from '../types/itinerary';
import type { ConfirmedHotelStay, TravelIntel } from '../types/travelIntel';
import { syncTravelIntelStatus } from '../types/travelIntel';
import type { RecommendedStayZone } from '../types/stayZone';

export function findHotelByNodeId(
  intel: TravelIntel,
  nodeId: string,
): ConfirmedHotelStay | undefined {
  return intel.hotels.find((h) => h.itinerary_node_id === nodeId);
}

export function findHotelByZoneId(
  intel: TravelIntel,
  zoneId: string,
): ConfirmedHotelStay | undefined {
  return intel.hotels.find((h) => h.zone_id === zoneId);
}

export function hotelFromZoneAndNode(
  zone: RecommendedStayZone,
  nodeId: string,
  node: Pick<ItineraryNode, 'name' | 'lat' | 'lng' | 'address'>,
  opts: { sequence: number; pendingMapPick?: boolean },
): ConfirmedHotelStay {
  const hasCoords = node.lat != null && node.lng != null && !opts.pendingMapPick;
  return {
    id: crypto.randomUUID(),
    sequence: opts.sequence,
    city: zone.city,
    name: node.name,
    check_in: zone.check_in,
    check_out: zone.check_out,
    is_primary: opts.sequence === 1,
    is_anchor: true,
    booking_status: hasCoords ? 'selected' : 'zone_only',
    zone_id: zone.id,
    itinerary_node_id: nodeId,
    lat: node.lat,
    lng: node.lng,
    address: node.address,
    purchase_url: zone.purchase_url,
  };
}

/** Lock hotel into travel_intel before itinerary exists (generate gate). */
export function hotelFromZoneInput(
  zone: RecommendedStayZone,
  input: {
    name: string;
    lat: number;
    lng: number;
    address?: string;
    pendingMapPick?: boolean;
  },
  opts: { sequence: number; previousId?: string },
): ConfirmedHotelStay {
  const hasCoords =
    !input.pendingMapPick &&
    input.lat != null &&
    input.lng != null &&
    (Math.abs(input.lat) > 1e-6 || Math.abs(input.lng) > 1e-6);
  return {
    id: opts.previousId ?? crypto.randomUUID(),
    sequence: opts.sequence,
    city: zone.city,
    name: input.name.trim() || '酒店（待命名）',
    check_in: zone.check_in,
    check_out: zone.check_out,
    is_primary: opts.sequence === 1,
    is_anchor: true,
    booking_status: hasCoords ? 'selected' : 'zone_only',
    zone_id: zone.id,
    lat: input.lat,
    lng: input.lng,
    address: input.address,
    purchase_url: zone.purchase_url,
  };
}

export function syncIntelHotelFromNode(
  intel: TravelIntel,
  nodeId: string,
  partial: Partial<ItineraryNode>,
): TravelIntel {
  const idx = intel.hotels.findIndex((h) => h.itinerary_node_id === nodeId);
  if (idx < 0) return intel;

  const prev = intel.hotels[idx];
  const lat = partial.lat ?? prev.lat;
  const lng = partial.lng ?? prev.lng;
  const hasCoords = lat != null && lng != null;
  const name = partial.name?.trim() || prev.name;
  const address = partial.address ?? prev.address;

  let booking_status = prev.booking_status;
  if (hasCoords && booking_status === 'zone_only') {
    booking_status = partial.coord_source === 'map_pick' ? 'selected' : 'selected';
  }

  const hotels = [...intel.hotels];
  hotels[idx] = {
    ...prev,
    name,
    lat,
    lng,
    address,
    booking_status,
  };
  return syncTravelIntelStatus({ ...intel, hotels });
}

export function removeHotelFromIntel(intel: TravelIntel, hotelId: string): TravelIntel {
  const hotels = intel.hotels.filter((h) => h.id !== hotelId);
  return syncTravelIntelStatus({ ...intel, hotels });
}

export function removeHotelByNodeId(intel: TravelIntel, nodeId: string): TravelIntel {
  const hotels = intel.hotels.filter((h) => h.itinerary_node_id !== nodeId);
  if (hotels.length === intel.hotels.length) return intel;
  return syncTravelIntelStatus({ ...intel, hotels });
}

export function patchStayZones(
  intel: TravelIntel,
  updater: (zones: RecommendedStayZone[]) => RecommendedStayZone[],
): TravelIntel {
  const zones = updater(intel.recommended_stay_zones ?? []);
  return syncTravelIntelStatus({ ...intel, recommended_stay_zones: zones });
}

/**
 * After generate: rebind travel_intel.hotels → new itinerary hotel nodes
 * (LLM invents new ids; without this Stay panel and graph diverge).
 */
export function rebindHotelsAfterGenerate(
  intel: TravelIntel,
  itinerary: { days: Array<{ nodes: ItineraryNode[] }>; meta?: { hotel_bindings?: Array<{ hotel_id?: string; hotel_name?: string; node_id: string }> } },
): TravelIntel {
  if (!intel.hotels.length) return intel;

  const bindings = itinerary.meta?.hotel_bindings ?? [];
  const byHotelId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const b of bindings) {
    if (b.hotel_id) byHotelId.set(b.hotel_id, b.node_id);
    if (b.hotel_name?.trim()) byName.set(b.hotel_name.trim().toLowerCase(), b.node_id);
  }

  const hotelNodes: ItineraryNode[] = [];
  for (const day of itinerary.days) {
    for (const n of day.nodes) {
      if (n.category === 'hotel') hotelNodes.push(n);
    }
  }

  const hotels = intel.hotels.map((h) => {
    let nodeId =
      (h.id && byHotelId.get(h.id)) ||
      (h.name?.trim() && byName.get(h.name.trim().toLowerCase())) ||
      undefined;
    if (!nodeId) {
      const match = hotelNodes.find(
        (n) => n.name.trim().toLowerCase() === h.name.trim().toLowerCase(),
      );
      nodeId = match?.id;
    }
    const node = nodeId ? hotelNodes.find((n) => n.id === nodeId) : undefined;
    return {
      ...h,
      itinerary_node_id: nodeId,
      lat: node?.lat ?? h.lat,
      lng: node?.lng ?? h.lng,
      address: node?.address ?? h.address,
      name: h.name,
    };
  });

  return syncTravelIntelStatus({ ...intel, hotels });
}
