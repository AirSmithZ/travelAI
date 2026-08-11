export type StayZoneStatus = 'proposed' | 'confirmed' | 'rejected';

export type StayZoneStrategy = 'compromise' | 'split' | 'main_cluster';

/** HOT-ZONE-TAG：机酒状态（卡上次要） */
export type StayZoneFitTag =
  | 'current_anchor'
  | 'preference_fit'
  | 'compromise'
  | 'needs_city_change';

export const STAY_ZONE_FIT_TAG_LABELS: Record<StayZoneFitTag, string> = {
  current_anchor: '当前锚点',
  preference_fit: '贴合偏好',
  compromise: '折中',
  needs_city_change: '需换城',
};

/** HOT-THEME-TAG：提示词主题（卡顶主展示；运行时，不写回 preference_tags） */
export interface PromptThemeTag {
  id: string;
  label: string;
  polarity?: 'positive' | 'negative';
  confidence?: number;
  evidence?: string;
  entity?: string;
}

export interface ThemeRef {
  id: string;
  label: string;
}

const THEME_CHIP_MAX = 4;

/** 卡顶主题：最多 4 个，溢出返回 +N */
export function stayZoneThemeChips(
  matched?: ThemeRef[] | null,
): { shown: ThemeRef[]; overflow: number } {
  const list = matched ?? [];
  if (list.length <= THEME_CHIP_MAX) return { shown: list, overflow: 0 };
  return {
    shown: list.slice(0, THEME_CHIP_MAX),
    overflow: list.length - THEME_CHIP_MAX,
  };
}

export function stayZoneFitTagLabel(tag?: StayZoneFitTag | null): string {
  if (!tag) return STAY_ZONE_FIT_TAG_LABELS.current_anchor;
  return STAY_ZONE_FIT_TAG_LABELS[tag] ?? tag;
}

export function isStayZoneBookable(zone: {
  bookable?: boolean;
  fit_tag?: StayZoneFitTag;
}): boolean {
  if (zone.bookable === false) return false;
  if (zone.fit_tag === 'needs_city_change') return false;
  return true;
}

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
  fit_tag?: StayZoneFitTag;
  bookable?: boolean;
  tag_note?: string;
  matched_themes?: ThemeRef[];
  uncovered_themes?: ThemeRef[];
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
  prompt_themes?: PromptThemeTag[];
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
