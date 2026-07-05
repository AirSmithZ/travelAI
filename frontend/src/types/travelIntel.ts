import type { FlightLegSnapshot, FlightQuote } from './flight';
import { formatFlightSource, formatLegRoute, isRoundTripQuote } from './flight';
import { resolveAirportCode } from '../data/airportLabels';
import type { HotelBookingStatus, RecommendedStayZone, StayZonePreferences } from './stayZone';
import { defaultStayZonePreferences } from './stayZone';

export type TravelIntelStatus = 'draft' | 'partial' | 'confirmed' | 'skipped';

export type FlightLegRole = 'outbound' | 'return' | 'intercity' | 'other';

export type BookingStatus = 'selected' | 'booked_external';

export interface ConfirmedFlightLeg {
  id: string;
  sequence: number;
  role: FlightLegRole;
  origin_iata: string;
  dest_iata: string;
  depart_at: string;
  arrive_at: string;
  airline: string;
  flight_numbers?: string[];
  stops: number;
  duration_minutes: number;
  quote: FlightQuote;
  quote_id: string;
  purchase_url?: string;
  booking_status: BookingStatus;
  is_anchor: boolean;
  bundle_id?: string;
}

/** 酒店段；Phase P5z 绑定片区与路线图节点 */
export interface ConfirmedHotelStay {
  id: string;
  sequence: number;
  city: string;
  name: string;
  check_in: string;
  check_out: string;
  is_primary: boolean;
  is_anchor: boolean;
  booking_status: HotelBookingStatus;
  zone_id?: string;
  itinerary_node_id?: string;
  lat?: number;
  lng?: number;
  address?: string;
  purchase_url?: string;
}

export interface FlightSearchSession {
  request_key: string;
  fetched_at: string;
  ranked: FlightQuote[];
  purchase_url: string;
  warnings: string[];
  is_round_trip?: boolean;
  /** 最近一次确认的报价 id；确认后折叠 ranked */
  confirmed_quote_id?: string | null;
  hide_ranked?: boolean;
}

export interface TravelIntel {
  status: TravelIntelStatus;
  confirmed_at?: string;
  skip_reason?: string;
  flights: ConfirmedFlightLeg[];
  hotels: ConfirmedHotelStay[];
  last_flight_search?: FlightSearchSession | null;
  recommended_stay_zones?: RecommendedStayZone[];
  stay_zone_preferences?: StayZonePreferences;
  stay_zones_fetched_at?: string | null;
}

export function createEmptyTravelIntel(): TravelIntel {
  return {
    status: 'draft',
    flights: [],
    hotels: [],
    last_flight_search: null,
    recommended_stay_zones: [],
    stay_zone_preferences: defaultStayZonePreferences(),
    stay_zones_fetched_at: null,
  };
}

export function syncTravelIntelStatus(intel: TravelIntel): TravelIntel {
  if (intel.status === 'skipped') return intel;
  const hasFlights = intel.flights.length > 0;
  const hasHotelCoords = intel.hotels.some(
    (h) => h.lat != null && h.lng != null && h.booking_status !== 'zone_only',
  );
  const hasConfirmedZone = (intel.recommended_stay_zones ?? []).some(
    (z) => z.status === 'confirmed',
  );
  if (!hasFlights && !hasHotelCoords && !hasConfirmedZone) {
    return { ...intel, status: 'draft', confirmed_at: undefined };
  }
  if (hasFlights && (hasHotelCoords || hasConfirmedZone)) {
    return {
      ...intel,
      status: 'confirmed',
      confirmed_at: intel.confirmed_at ?? new Date().toISOString(),
    };
  }
  return {
    ...intel,
    status: 'partial',
    confirmed_at: intel.confirmed_at ?? new Date().toISOString(),
  };
}

/** 航班 Panel 头部状态：阶段 B → 待确认（有候选）→ 已完成（有航段） */
export type FlightIntelPanelPhase = 'idle' | 'pending' | 'done';

export function getFlightIntelPanelPhase(intel: TravelIntel): FlightIntelPanelPhase {
  if (intel.flights.length > 0) return 'done';
  if ((intel.last_flight_search?.ranked.length ?? 0) > 0) return 'pending';
  return 'idle';
}

export function flightIntelPanelBadgeLabel(phase: FlightIntelPanelPhase): string {
  switch (phase) {
    case 'done':
      return '已完成';
    case 'pending':
      return '待确认';
    default:
      return '阶段 B';
  }
}

function legMatchesConfirmedQuote(leg: ConfirmedFlightLeg, quoteId: string): boolean {
  if (leg.quote_id === quoteId || leg.quote.id === quoteId) return true;
  if (leg.quote_id.startsWith(`${quoteId}-`)) return true;
  return false;
}

/** 移除航段后同步搜索 session，避免已选卡片与 ranked 折叠态残留 */
export function syncFlightSearchAfterLegRemoval(
  session: FlightSearchSession,
  remainingFlights: ConfirmedFlightLeg[],
): FlightSearchSession {
  if (remainingFlights.length === 0 || !session.hide_ranked) {
    return {
      ...session,
      confirmed_quote_id: remainingFlights.length === 0 ? null : session.confirmed_quote_id,
      hide_ranked: remainingFlights.length === 0 ? false : session.hide_ranked,
    };
  }
  const confirmedId = session.confirmed_quote_id;
  if (!confirmedId) {
    return { ...session, hide_ranked: false };
  }
  const stillMatches = remainingFlights.some((f) => legMatchesConfirmedQuote(f, confirmedId));
  if (!stillMatches) {
    return { ...session, confirmed_quote_id: null, hide_ranked: false };
  }
  return session;
}

export function flightLegFromQuote(
  quote: FlightQuote,
  opts: {
    sequence: number;
    role: FlightLegRole;
    purchaseUrl: string;
    bundleId?: string;
    priceShare?: 'full' | 'none';
  },
): ConfirmedFlightLeg {
  const priceShare = opts.priceShare ?? 'full';
  const legQuote: FlightQuote =
    priceShare === 'none'
      ? { ...quote, price_amount: 0, rank_reason: '往返组合价见去程' }
      : quote;

  return {
    id: crypto.randomUUID(),
    sequence: opts.sequence,
    role: opts.role,
    origin_iata: quote.origin_iata,
    dest_iata: quote.dest_iata,
    depart_at: quote.depart_time,
    arrive_at: quote.arrive_time,
    airline: quote.airline,
    flight_numbers: quote.flight_numbers,
    stops: quote.stops,
    duration_minutes: quote.duration_minutes,
    quote: legQuote,
    quote_id: quote.id,
    purchase_url: quote.purchase_url ?? opts.purchaseUrl,
    booking_status: 'selected',
    is_anchor: true,
    bundle_id: opts.bundleId,
  };
}

function quoteFromReturnLeg(
  parent: FlightQuote,
  leg: FlightLegSnapshot,
  role: FlightLegRole,
): FlightQuote {
  return {
    id: `${parent.id}-${role}`,
    origin_iata: leg.origin_iata,
    dest_iata: leg.dest_iata,
    airline: leg.airline,
    route_label: leg.route_label,
    depart_time: leg.depart_time,
    arrive_time: leg.arrive_time,
    duration_minutes: leg.duration_minutes,
    stops: leg.stops,
    price_amount: 0,
    price_currency: parent.price_currency,
    source: parent.source,
    confidence: parent.confidence,
    purchase_url: parent.purchase_url,
    trip_type: 'one_way',
    flight_numbers: leg.flight_numbers,
    rank_reason: '往返组合价见去程',
  };
}

/** 单程确认 1 条；往返组合确认去程+回程 2 条。 */
export function flightLegsFromQuote(
  quote: FlightQuote,
  opts: {
    startSequence: number;
    role: FlightLegRole;
    purchaseUrl: string;
  },
): ConfirmedFlightLeg[] {
  if (!isRoundTripQuote(quote) || !quote.return_leg) {
    return [
      flightLegFromQuote(quote, {
        sequence: opts.startSequence,
        role: opts.role,
        purchaseUrl: opts.purchaseUrl,
      }),
    ];
  }

  const bundleId = crypto.randomUUID();
  const outbound = flightLegFromQuote(quote, {
    sequence: opts.startSequence,
    role: 'outbound',
    purchaseUrl: opts.purchaseUrl,
    bundleId,
    priceShare: 'full',
  });
  const returnQuote = quoteFromReturnLeg(quote, quote.return_leg, 'return');
  const inbound = flightLegFromQuote(returnQuote, {
    sequence: opts.startSequence + 1,
    role: 'return',
    purchaseUrl: opts.purchaseUrl,
    bundleId,
    priceShare: 'none',
  });
  return [outbound, inbound];
}

export interface ManualFlightLegInput {
  role: FlightLegRole;
  origin: string;
  destination: string;
  depart_at: string;
  arrive_at: string;
  airline?: string;
  flight_numbers?: string[];
  stops?: number;
  purchase_url?: string;
  booked_external?: boolean;
  price_amount?: number;
  price_currency?: string;
}

function diffMinutes(departIso: string, arriveIso: string): number {
  const d0 = new Date(departIso).getTime();
  const d1 = new Date(arriveIso).getTime();
  if (Number.isNaN(d0) || Number.isNaN(d1) || d1 <= d0) return 0;
  return Math.round((d1 - d0) / 60_000);
}

export function flightLegFromManualInput(
  input: ManualFlightLegInput,
  opts: { sequence: number; defaultPurchaseUrl?: string },
): ConfirmedFlightLeg {
  const origin_iata = resolveAirportCode(input.origin);
  const dest_iata = resolveAirportCode(input.destination);
  const duration_minutes = diffMinutes(input.depart_at, input.arrive_at);
  const flight_numbers = input.flight_numbers?.filter(Boolean);

  const quote: FlightQuote = {
    id: `manual-${crypto.randomUUID()}`,
    origin_iata,
    dest_iata,
    airline: input.airline?.trim() || '—',
    route_label: `${origin_iata}→${dest_iata}`,
    depart_time: input.depart_at,
    arrive_time: input.arrive_at,
    duration_minutes,
    stops: input.stops ?? 0,
    price_amount: input.price_amount ?? 0,
    price_currency: input.price_currency ?? 'CNY',
    source: 'manual',
    confidence: 'low',
    trip_type: 'one_way',
    flight_numbers,
  };

  return {
    id: crypto.randomUUID(),
    sequence: opts.sequence,
    role: input.role,
    origin_iata,
    dest_iata,
    depart_at: input.depart_at,
    arrive_at: input.arrive_at,
    airline: quote.airline,
    flight_numbers,
    stops: quote.stops,
    duration_minutes,
    quote,
    quote_id: quote.id,
    purchase_url: input.purchase_url?.trim() || opts.defaultPurchaseUrl,
    booking_status: input.booked_external ? 'booked_external' : 'selected',
    is_anchor: true,
  };
}

export function formatFlightLegSummary(leg: ConfirmedFlightLeg): string {
  const roleLabel: Record<FlightLegRole, string> = {
    outbound: '去程',
    return: '回程',
    intercity: '城际',
    other: '航段',
  };
  const route = formatLegRoute({
    route_label: leg.quote.route_label,
    origin_iata: leg.origin_iata,
    dest_iata: leg.dest_iata,
  });
  const flights =
    leg.flight_numbers?.length ? ` · ${leg.flight_numbers.join('/')}` : '';
  const sourceTag = formatFlightSource(leg.quote.source, leg.booking_status === 'booked_external');
  const price =
    leg.quote.price_amount > 0
      ? ` · ${leg.quote.price_currency} ${leg.quote.price_amount}`
      : leg.bundle_id
        ? ' · 往返组合'
        : '';
  const tag = sourceTag ? ` · ${sourceTag}` : '';
  return `${roleLabel[leg.role]} · ${route} · ${leg.airline}${flights}${price}${tag}`;
}
