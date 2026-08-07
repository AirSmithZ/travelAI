import type { TravelIntel } from '../types/travelIntel';

/** Canonical payload — must match backend `intel_snapshot_payload`. */
export function intelSnapshotPayload(intel: TravelIntel | null | undefined): {
  flights: unknown[];
  hotels: unknown[];
  zones: unknown[];
} {
  if (!intel) return { flights: [], hotels: [], zones: [] };
  const flights = (intel.flights ?? []).map((f) => ({
    sequence: f.sequence,
    role: f.role,
    origin_iata: f.origin_iata,
    dest_iata: f.dest_iata,
    depart_at: f.depart_at,
    arrive_at: f.arrive_at,
    quote_id: f.quote_id ?? null,
    flight_numbers: f.flight_numbers,
  }));
  const hotels = (intel.hotels ?? []).map((h) => ({
    sequence: h.sequence,
    name: h.name,
    zone_id: h.zone_id,
    check_in: h.check_in,
    check_out: h.check_out,
  }));
  const zones = (intel.recommended_stay_zones ?? [])
    .filter((z) => z.status === 'confirmed')
    .map((z) => ({ id: z.id, status: z.status, label: z.label }));
  return { flights, hotels, zones };
}

export function isIntelDirty(
  intel: TravelIntel | null | undefined,
  snapshot: unknown,
): boolean {
  if (snapshot == null) return false;
  try {
    return (
      JSON.stringify(intelSnapshotPayload(intel)) !== JSON.stringify(snapshot)
    );
  } catch {
    return true;
  }
}
