export type NodeCategory =
  | 'airport'
  | 'hotel'
  | 'restaurant'
  | 'snack'
  | 'attraction'
  | 'landmark'
  | 'transit';

export type EdgeType = 'primary' | 'alternative';

export type TransportMode =
  | 'walk'
  | 'subway'
  | 'bus'
  | 'taxi'
  | 'flight'
  | 'ferry';

export type CoordConfidence = 'high' | 'medium' | 'low' | 'none' | 'manual';

export type CostPer = 'person' | 'total' | 'group';

export type WeatherIcon = 'sunny' | 'cloudy' | 'overcast' | 'rain' | 'storm' | 'snow';

export type WeatherSource = 'llm' | 'manual' | 'api';

export interface NodeCost {
  amount?: number;
  currency?: string;
  per?: CostPer;
  note?: string;
}

export interface DayWeather {
  temp_min: number;
  temp_max: number;
  icon: WeatherIcon;
  description: string;
  source?: WeatherSource;
}

/** Public-note corroboration links from EvidencePack (WS-04 / WS-07). */
export interface ItineraryEvidenceItem {
  title: string;
  url: string;
  snippet?: string;
  likes?: number | null;
  source?: string;
  query?: string;
  note_id?: string;
  /** WS-08a: note mentions a geocode-fenced POI */
  verified?: boolean;
  poi_hits?: string[];
}

export interface ItineraryPoiCandidate {
  name: string;
  mentions?: number;
  verified?: boolean;
  lat?: number;
  lng?: number;
  display_name?: string;
  /** WS-08b */
  place_types?: string[];
  rating?: number;
  place_id?: string;
  /** Soft open-hours from Places (may be stale) */
  hours_text?: string;
  open_state?: string;
}

export interface ItineraryMeta {
  generated_at: string;
  model: string;
  locale: 'zh-CN';
  warnings: string[];
  evidence?: ItineraryEvidenceItem[];
  /** ok | empty | unconfigured — set even when evidence[] is missing */
  evidence_status?: 'ok' | 'empty' | 'unconfigured' | string;
  /** WS-08a light POI tally after fence validate */
  poi_candidates?: ItineraryPoiCandidate[];
  /** B-P4-04 / FLOW-02 */
  flight_quote_ids?: string[];
  intel_fingerprint?: string;
  intel_snapshot?: {
    flights: unknown[];
    hotels: unknown[];
    zones: unknown[];
  };
  /** Backend intel_anchor_enforce: confirmed hotel → overnight node */
  hotel_bindings?: Array<{
    hotel_id?: string;
    hotel_name?: string;
    node_id: string;
    day_index?: number;
  }>;
}

export interface ItineraryNode {
  id: string;
  name: string;
  /** Official / common English name for geocoding (from LLM) */
  name_en?: string;
  category: NodeCategory;
  lat: number;
  lng: number;
  address?: string;
  floor?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  is_optional: boolean;
  tips?: string[];
  tags?: string[];
  cost_label?: string;
  cost?: NodeCost;
  /** 同场景分组（如机场 T1/T2），路线图虚线框 */
  scene_group?: string;
  coord_confidence?: CoordConfidence;
  coord_source?: string;
  /** DATA-10: stable place id from geocoder when available */
  place_id?: string;
  region?: string;
  position?: { x: number; y: number };
  /** 总览模式拖拽偏移（相对 layoutOverview 基准位置） */
  overview_offset?: { x: number; y: number };
}

export interface ItineraryEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  transport_mode: TransportMode;
  duration_minutes: number;
  distance_meters?: number;
  depart_time?: string;
  arrive_time?: string;
  label?: string;
}

export interface DayPlan {
  day_index: number;
  date: string;
  weekday: string;
  label: string;
  weather?: DayWeather;
  region?: string;
  nodes: ItineraryNode[];
  edges: ItineraryEdge[];
}

export interface Itinerary {
  id: string;
  title: string;
  destination: string;
  timezone: string;
  days: DayPlan[];
  /** 跨日连线（总览模式跨列虚线弧） */
  cross_day_edges?: ItineraryEdge[];
  meta: ItineraryMeta;
}

export type ViewTab = 'graph' | 'map';
export type GraphViewMode = 'day' | 'overview';
