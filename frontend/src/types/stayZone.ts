export type StayZoneStatus = 'proposed' | 'confirmed' | 'rejected';

export type StayZoneStrategy = 'compromise' | 'split' | 'main_cluster';

export interface StayZoneCircleGeometry {
  type: 'circle';
  center: { lat: number; lng: number };
  radius_m: number;
}

export interface StayZonePolygonGeometry {
  type: 'polygon';
  coordinates: [number, number][];
}

export type StayZoneGeometry = StayZoneCircleGeometry | StayZonePolygonGeometry;

export interface StayZonePreferences {
  transit: number;
  minimize_hotel_moves?: boolean;
  quiet?: number;
  family_friendly?: number;
  budget?: number;
  walk_tolerance?: 'low' | 'medium' | 'high';
  safety_sensitive?: boolean;
  scenery?: number;
}

export interface RecommendedStayZone {
  id: string;
  sequence: number;
  city: string;
  label: string;
  check_in: string;
  check_out: string;
  rationale: string;
  transit_note?: string;
  strategy?: StayZoneStrategy;
  anchor_hints?: string[];
  covers_day_indices?: number[];
  status: StayZoneStatus;
  geometry?: StayZoneGeometry;
  purchase_url?: string;
}

export interface StayZoneRecommendRequest {
  trip_request: import('./tripRequest').TripRequest;
  flights: unknown[];
  itinerary?: import('./itinerary').Itinerary | null;
  preferences?: StayZonePreferences;
}

export interface StayZoneRecommendResponse {
  zones: RecommendedStayZone[];
  fetched_at: string;
  source: 'llm' | 'heuristic';
  warnings: string[];
}

export type HotelBookingStatus = 'zone_only' | 'selected' | 'booked_external';

export function defaultStayZonePreferences(): StayZonePreferences {
  return { transit: 1.0, minimize_hotel_moves: true, walk_tolerance: 'medium' };
}

export type StayZonePanelPhase = 'idle' | 'pending' | 'done';

export function getStayZonePanelPhase(intel: {
  recommended_stay_zones?: RecommendedStayZone[];
  hotels: { lat?: number; lng?: number; booking_status?: string; name?: string }[];
}): StayZonePanelPhase {
  const zones = intel.recommended_stay_zones ?? [];
  const hotelLocked = intel.hotels.some(
    (h) =>
      Boolean(h.name?.trim()) &&
      h.lat != null &&
      h.lng != null &&
      (Math.abs(h.lat) > 1e-6 || Math.abs(h.lng) > 1e-6) &&
      h.booking_status !== 'zone_only',
  );
  // P88: badge「已完成」= 已锁定具体酒店；仅片区仍为待确认
  if (hotelLocked) return 'done';
  if (zones.some((z) => z.status === 'confirmed' || z.status === 'proposed')) return 'pending';
  return 'idle';
}

export function stayZonePanelBadgeLabel(phase: StayZonePanelPhase): string {
  switch (phase) {
    case 'done':
      return '已锁酒店';
    case 'pending':
      return '待锁酒店';
    default:
      return '阶段 B';
  }
}

export function formatStayZoneDays(zone: RecommendedStayZone): string {
  const idx = zone.covers_day_indices ?? [];
  if (idx.length === 0) return `${zone.check_in} → ${zone.check_out}`;
  const days = idx.map((i) => `Day ${i + 1}`).join('、');
  return `${days} · ${zone.check_in} → ${zone.check_out}`;
}
