import { formatEndpointPair, formatRouteLabel } from '../data/airportLabels';

export interface FlightPurchaseChannel {
  name: 'Trip.com';
  url: string;
  type: 'search';
  note: string;
}

export type RankPreference = 'cheap' | 'fast' | 'balanced';

export type FlightTripType = 'one_way' | 'round_trip';

export type FlightSource = 'ignav' | 'letsfg' | 'manual';

export interface FlightLegSnapshot {
  origin_iata: string;
  dest_iata: string;
  airline: string;
  route_label: string;
  depart_time: string;
  arrive_time: string;
  duration_minutes: number;
  stops: number;
  flight_numbers?: string[];
}

export interface FlightSearchRequest {
  origin: string;
  destination: string;
  date: string;
  return_date?: string | null;
  adults?: number;
  cabin?: 'economy' | 'premium_economy' | 'business' | 'first';
  preference?: RankPreference;
  include_letsfg?: boolean;
  include_ignav?: boolean;
}

export interface FlightQuote {
  id: string;
  origin_iata: string;
  dest_iata: string;
  airline: string;
  route_label: string;
  depart_time: string;
  arrive_time: string;
  duration_minutes: number;
  stops: number;
  price_amount: number;
  price_currency: string;
  source: FlightSource | string;
  confidence: 'high' | 'medium' | 'low';
  rank?: number | null;
  score?: number | null;
  rank_reason?: string | null;
  bookability?: string;
  purchase_url?: string | null;
  trip_type?: FlightTripType;
  return_leg?: FlightLegSnapshot | null;
  flight_numbers?: string[];
}

export interface FlightSearchResponse {
  request: FlightSearchRequest;
  purchase: FlightPurchaseChannel;
  fetched_at: string;
  offers?: FlightQuote[];
  ranked?: FlightQuote[];
  sources_used?: string[];
  warnings?: string[];
  errors?: Record<string, string>;
  latency_ms?: Record<string, number>;
}

export interface FlightIntentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FlightIntentParsed {
  origin: string | null;
  destination: string | null;
  date: string | null;
  return_date: string | null;
  adults: number;
  preference: RankPreference;
  missing_fields: string[];
}

export interface FlightVerifyFromTextRequest {
  message: string;
  chat_history?: FlightIntentMessage[];
}

export interface FlightVerifyFromTextResponse {
  reply: string;
  parsed: FlightIntentParsed;
  search: FlightSearchResponse | null;
  recommendation?: string | null;
  warnings?: string[];
}

export interface FlightVerifyTurn {
  id: string;
  userMessage: string;
  response: FlightVerifyFromTextResponse;
}

const PREFERENCE_LABELS: Record<RankPreference, string> = {
  cheap: '便宜优先',
  fast: '省时优先',
  balanced: '性价比（价时中转到）',
};

export function formatPreference(pref: RankPreference): string {
  return PREFERENCE_LABELS[pref] ?? pref;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function formatPrice(offer: FlightQuote): string {
  if (offer.price_amount <= 0) return '—';
  const suffix = offer.trip_type === 'round_trip' ? '（往返）' : '';
  return `${offer.price_currency} ${offer.price_amount.toLocaleString()}${suffix}`;
}

export function formatTimeShort(iso: string): string {
  if (!iso) return '—';
  const t = iso.includes('T') ? iso.slice(11, 16) : iso.slice(0, 5);
  return t || '—';
}

export function formatStopsLabel(stops: number): string {
  if (stops === 0) return '直飞';
  return `${stops} 停`;
}

export function formatLegRoute(
  leg: Pick<FlightLegSnapshot, 'route_label' | 'origin_iata' | 'dest_iata'>,
): string {
  if (leg.route_label?.includes('→')) {
    return formatRouteLabel(leg.route_label);
  }
  return formatEndpointPair(leg.origin_iata, leg.dest_iata);
}

export function isRoundTripQuote(offer: FlightQuote): boolean {
  return offer.trip_type === 'round_trip' && !!offer.return_leg;
}

export function totalTripDuration(offer: FlightQuote): number {
  let total = offer.duration_minutes || 0;
  if (offer.return_leg) total += offer.return_leg.duration_minutes || 0;
  return total;
}

export function formatFlightSource(source: string | undefined, bookedExternal?: boolean): string {
  if (source === 'manual') {
    return bookedExternal ? '已订·手动' : '手动录入';
  }
  if (source === 'ignav') return '参考价';
  return '';
}
