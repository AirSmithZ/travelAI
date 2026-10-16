export type NodeCategory =
  | 'airport'
  | 'hotel'
  | 'restaurant'
  | 'snack'
  | 'attraction'
  | 'landmark'
  | 'transit';

export type TransportMode = 'walk' | 'subway' | 'bus' | 'taxi' | 'flight' | 'ferry';

export type QuoteCurrency = 'CNY' | 'AUD' | 'NZD';

export interface CostQuote {
  item: string;
  currency: QuoteCurrency;
  per_person: number | null;
  party: number | null;
  in_total: boolean;
  note?: string;
}

export interface TripNode {
  id: string;
  name: string;
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
  cost_quotes?: CostQuote[];
  region?: string;
  coord_confidence?: string;
  coord_source?: string;
  scene_group?: string;
  place_id?: string;
  evidence_refs?: unknown[];
}

export interface TripEdge {
  id: string;
  from: string;
  to: string;
  type: 'primary' | 'alternative';
  transport_mode: TransportMode;
  duration_minutes: number;
  distance_meters?: number;
  label?: string;
  route_source?: string;
  depart_time?: string;
  arrive_time?: string;
}

export interface DayPlan {
  day_index: number;
  date: string;
  weekday: string;
  label: string;
  region?: string;
  weather?: {
    temp_min?: number;
    temp_max?: number;
    icon?: string;
    description?: string;
  };
  nodes: TripNode[];
  edges: TripEdge[];
}

export interface Itinerary {
  id: string;
  title: string;
  destination: string;
  timezone: string;
  days: DayPlan[];
  cross_day_edges?: TripEdge[];
  meta: {
    generated_at?: string;
    model?: string;
    locale?: string;
    warnings?: string[];
    expense_extras?: CostQuote[];
  };
}

/** 包在行程外面的本机文档。行程正文来自 anzTrip，改动只写 localStorage。 */
export interface Doc {
  origin: 'seed' | 'local';
  savedAt: string;
  travelers: number;
  itinerary: Itinerary;
}

export type Scope = 'day' | 'all';
export type PanelId = 'graph' | 'map' | 'cost';
export type LayoutLock = 'auto' | 'portrait' | 'landscape';

export interface EditorSession {
  token: number;
  mode: 'create' | 'edit';
  dayIndex: number;
  nodeId: string;
}

export interface UiState {
  scope: Scope;
  dayIndex: number;
  panel: PanelId;
  selectedId: string | null;
  layoutLock: LayoutLock;
  editor: EditorSession | null;
}

export interface SaveNodeInput {
  mode: 'create' | 'edit';
  dayIndex: number;
  node: TripNode;
  /** 有 id 且已存在则改那条线；否则作为新线加进当天。null 表示不动线。 */
  edge: TripEdge | null;
}

export const CATEGORIES: { id: NodeCategory; label: string; color: string; glow: string; icon: string }[] = [
  { id: 'airport', label: '机场', color: '#2d8f6f', glow: 'rgba(45,143,111,0.45)', icon: '✈' },
  { id: 'hotel', label: '酒店', color: '#6b7280', glow: 'rgba(107,114,128,0.35)', icon: '🛏' },
  { id: 'restaurant', label: '餐厅', color: '#b83240', glow: 'rgba(184,50,64,0.4)', icon: '🍽' },
  { id: 'snack', label: '小吃', color: '#d97706', glow: 'rgba(217,119,6,0.4)', icon: '🍜' },
  { id: 'attraction', label: '游玩', color: '#ca9a04', glow: 'rgba(202,154,4,0.4)', icon: '📷' },
  { id: 'landmark', label: '地标', color: '#6366d4', glow: 'rgba(99,102,212,0.4)', icon: '📍' },
  { id: 'transit', label: '交通', color: '#0891b2', glow: 'rgba(8,145,178,0.4)', icon: '↔' },
];

export const TRANSPORTS: { id: TransportMode; label: string }[] = [
  { id: 'walk', label: '步行' },
  { id: 'subway', label: '地铁' },
  { id: 'bus', label: '公交/大巴' },
  { id: 'taxi', label: '出租/网约' },
  { id: 'flight', label: '飞机' },
  { id: 'ferry', label: '船' },
];

export function categoryMeta(category: string): { label: string; color: string; glow: string; icon: string } {
  return CATEGORIES.find((item) => item.id === category) ?? {
    label: '站点',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
    icon: '•',
  };
}

export function transportLabel(mode: string): string {
  return TRANSPORTS.find((item) => item.id === mode)?.label ?? mode;
}
