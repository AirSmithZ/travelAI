/**
 * Client-side mirror of backend intel_anchor_enforce day-loop placement.
 * Used when user locks/replaces a hotel while an itinerary already exists.
 */
import type { Itinerary, ItineraryEdge, ItineraryNode } from '../types/itinerary';
import type { ConfirmedHotelStay } from '../types/travelIntel';
import type { RecommendedStayZone } from '../types/stayZone';

type Slot = 'morning' | 'evening';

const WALK_KMH = 4.5;
const TAXI_KMH = 28.0;
/** Prefer walk under this straight-line distance (TRN-05). */
const WALK_PREF_M = 1200;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type HotelBinding = {
  hotel_id?: string;
  hotel_name: string;
  node_id: string;
  day_index: number;
};

export type ApplyHotelDayLoopOptions = {
  /**
   * Only rewrite days owned by these hotels' overnight windows (or replaceHotelId days).
   * Other days keep existing nodes/edges (HOT-SWAP-01 / P128).
   */
  scopeHotelIds?: string[];
  /**
   * Prefer rewriting days previously bound to this hotel id (replace-in-place).
   * Falls back to the new hotel's check_in/out window when no bindings exist.
   */
  replaceHotelId?: string;
};

function datePrefix(value: string | undefined | null): string {
  const s = (value ?? '').trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function hasCoords(n: Pick<ItineraryNode, 'lat' | 'lng'>): boolean {
  return (
    n.lat != null &&
    n.lng != null &&
    Number.isFinite(n.lat) &&
    Number.isFinite(n.lng) &&
    (Math.abs(n.lat) > 1e-6 || Math.abs(n.lng) > 1e-6)
  );
}

/** Haversine estimate for reconnect — never silent bare 20 (TRN-05 / P129). */
export function estimateCommuteEdge(
  from: ItineraryNode,
  to: ItineraryNode,
  id: string,
): ItineraryEdge {
  if (hasCoords(from) && hasCoords(to)) {
    const meters = Math.round(haversineM(from.lat, from.lng, to.lat, to.lng));
    const walkMin = Math.max(1, Math.round((meters / 1000 / WALK_KMH) * 60));
    const taxiMin = Math.max(1, Math.round((meters / 1000 / TAXI_KMH) * 60));
    if (meters <= WALK_PREF_M) {
      return {
        id,
        from: from.id,
        to: to.id,
        type: 'primary',
        transport_mode: 'walk',
        duration_minutes: walkMin,
        distance_meters: meters,
        route_source: 'estimate',
      };
    }
    return {
      id,
      from: from.id,
      to: to.id,
      type: 'primary',
      transport_mode: 'taxi',
      duration_minutes: taxiMin,
      distance_meters: meters,
      route_source: 'estimate',
    };
  }
  return {
    id,
    from: from.id,
    to: to.id,
    type: 'primary',
    transport_mode: 'walk',
    duration_minutes: 12,
    route_source: 'estimate',
  };
}

/** Confirmed return flight day — no evening hotel check-in (P92). */
function resolveDepartureDayIndex(
  itinerary: Itinerary,
  flights: Array<{ role?: string; depart_at?: string }> | undefined,
): number | null {
  const dateToI = new Map<string, number>();
  itinerary.days.forEach((day, i) => {
    const d = datePrefix(day.date);
    if (d) dateToI.set(d, i);
  });
  for (const f of flights ?? []) {
    if (f.role !== 'return') continue;
    const d = datePrefix(f.depart_at);
    if (d && dateToI.has(d)) return dateToI.get(d)!;
  }
  return null;
}

function dayIndicesForHotel(
  hotel: ConfirmedHotelStay,
  itinerary: Itinerary,
  zones: RecommendedStayZone[],
  departureDay: number | null,
): number[] {
  const n = itinerary.days.length;
  if (n === 0) return [];

  const cin = datePrefix(hotel.check_in);
  const cout = datePrefix(hotel.check_out);
  if (cin && cout) {
    const out: number[] = [];
    itinerary.days.forEach((day, i) => {
      const d = datePrefix(day.date);
      if (d && cin <= d && d < cout) out.push(i);
    });
    if (out.length) {
      return departureDay != null ? out.filter((i) => i !== departureDay) : out;
    }
  }

  if (hotel.zone_id) {
    const zone = zones.find((z) => z.id === hotel.zone_id);
    let covers = (zone?.covers_day_indices ?? []).filter((i) => i >= 0 && i < n);
    if (departureDay != null) covers = covers.filter((i) => i !== departureDay);
    if (covers.length) return [...new Set(covers)].sort((a, b) => a - b);
  }

  let nights = itinerary.days.map((_, i) => i);
  if (departureDay != null && departureDay >= 0 && departureDay < n) {
    nights = nights.filter((i) => i !== departureDay);
  } else if (n > 1) {
    nights = nights.slice(0, n - 1);
  }
  return nights;
}

function daysFromReplaceBindings(
  replaceHotelId: string,
  bindings: HotelBinding[],
  nDays: number,
): number[] {
  const out = bindings
    .filter((b) => b.hotel_id === replaceHotelId)
    .map((b) => Math.max(0, (b.day_index || 1) - 1))
    .filter((i) => i < nDays);
  return [...new Set(out)].sort((a, b) => a - b);
}

function expandLoopDays(
  overnight: number[],
  nDays: number,
  departureDay: number | null,
): Map<number, Set<Slot>> {
  const plan = new Map<number, Set<Slot>>();
  if (nDays === 0) return plan;
  const overnightSet = new Set(overnight);

  let departureI: number | null =
    departureDay != null && departureDay >= 0 && departureDay < nDays
      ? departureDay
      : null;
  if (departureI == null && overnightSet.size > 0) {
    const next = Math.max(...overnightSet) + 1;
    if (next < nDays) {
      departureI = next;
    } else if (!overnightSet.has(nDays - 1)) {
      departureI = nDays - 1;
    }
  }

  for (let i = 0; i < nDays; i++) {
    const slots = new Set<Slot>();
    const isArrival = i === 0;
    let isDeparture = departureI != null && i === departureI;
    if (i === nDays - 1 && !overnightSet.has(i) && overnightSet.size > 0) {
      isDeparture = true;
    }
    if (departureDay != null && i === departureDay) {
      isDeparture = true;
    }
    if (overnightSet.has(i)) {
      if (!isArrival) slots.add('morning');
      if (!isDeparture) slots.add('evening');
      if (isArrival && isDeparture) slots.add('evening');
    } else if (isDeparture && overnightSet.size > 0) {
      slots.add('morning');
    }
    if (slots.size) plan.set(i, slots);
  }

  if (overnightSet.has(0)) {
    const s = plan.get(0) ?? new Set<Slot>();
    s.add('evening');
    s.delete('morning');
    plan.set(0, s);
  }

  if (departureI != null && (plan.has(departureI) || overnightSet.size > 0)) {
    plan.set(departureI, new Set<Slot>(['morning']));
  } else {
    const last = nDays - 1;
    if (plan.has(last) && !overnightSet.has(last)) {
      plan.set(last, new Set<Slot>(['morning']));
    }
  }

  return plan;
}

function applyHotelFields(
  node: ItineraryNode,
  hotel: ConfirmedHotelStay,
  role: Slot,
): ItineraryNode {
  const tips = [...(node.tips ?? [])].filter(
    (t) => !t.includes('出发') && !t.includes('回'),
  );
  if (role === 'morning') tips.unshift('从酒店出发');
  else tips.unshift('返回酒店过夜');

  return {
    ...node,
    name: hotel.name.trim() || node.name,
    category: 'hotel',
    address: hotel.address ?? node.address,
    cost_label: node.cost_label || '住宿',
    start_time: role === 'morning' ? '08:00' : '21:00',
    end_time: role === 'morning' ? '08:30' : '08:00',
    lat: hotel.lat ?? node.lat,
    lng: hotel.lng ?? node.lng,
    coord_confidence:
      hotel.lat != null && hotel.lng != null ? 'high' : node.coord_confidence,
    coord_source:
      hotel.lat != null && hotel.lng != null ? 'travel_intel' : node.coord_source,
    region: node.region || hotel.city,
    tips: tips.slice(0, 8),
    is_optional: false,
  };
}

function newHotelNode(
  hotel: ConfirmedHotelStay,
  dayIndex: number,
  dayNum: number,
  role: Slot,
  existingIds: Set<string>,
): ItineraryNode {
  let id = `d${dayNum}-hotel-${hotel.sequence}-${role.slice(0, 2)}`;
  let suffix = 1;
  while (existingIds.has(id)) {
    suffix += 1;
    id = `d${dayNum}-hotel-${hotel.sequence}-${role.slice(0, 2)}-${suffix}`;
  }
  existingIds.add(id);
  return applyHotelFields(
    {
      id,
      name: hotel.name,
      category: 'hotel',
      lat: hotel.lat ?? 0,
      lng: hotel.lng ?? 0,
      region: hotel.city,
      is_optional: false,
      coord_confidence: 'none',
      cost_label: '住宿',
    },
    hotel,
    role,
  );
}

function reconnectPrimary(dayNum: number, nodes: ItineraryNode[], edges: ItineraryEdge[]): ItineraryEdge[] {
  const idSet = new Set(nodes.map((n) => n.id));
  const alt = edges.filter(
    (e) => e.type === 'alternative' && idSet.has(e.from) && idSet.has(e.to),
  );
  const primary: ItineraryEdge[] = [];
  for (let j = 1; j < nodes.length; j++) {
    primary.push(estimateCommuteEdge(nodes[j - 1], nodes[j], `d${dayNum}-e${j}`));
  }
  return [...primary, ...alt];
}

function placeDayHotels(
  nodes: ItineraryNode[],
  edges: ItineraryEdge[],
  hotel: ConfirmedHotelStay,
  dayIndex: number,
  dayNum: number,
  slots: Set<Slot>,
): { nodes: ItineraryNode[]; edges: ItineraryEdge[]; nodeIds: string[] } {
  let middle = nodes.filter((n) => n.category !== 'hotel');
  const head: ItineraryNode[] = [];
  const tail: ItineraryNode[] = [];
  if (middle[0]?.category === 'airport' && !slots.has('morning')) {
    head.push(middle[0]);
    middle = middle.slice(1);
  }
  if (middle[middle.length - 1]?.category === 'airport' && !slots.has('evening')) {
    tail.unshift(middle[middle.length - 1]);
    middle = middle.slice(0, -1);
  }

  const existingIds = new Set<string>();
  const next: ItineraryNode[] = [];
  const nodeIds: string[] = [];
  if (slots.has('morning')) {
    const m = newHotelNode(hotel, dayIndex, dayNum, 'morning', existingIds);
    next.push(m);
    nodeIds.push(m.id);
  }
  for (const n of [...head, ...middle, ...tail]) {
    existingIds.add(n.id);
    next.push(n);
  }
  if (slots.has('evening')) {
    const e = newHotelNode(hotel, dayIndex, dayNum, 'evening', existingIds);
    next.push(e);
    nodeIds.push(e.id);
  }

  return {
    nodes: next,
    edges: reconnectPrimary(dayNum, next, edges),
    nodeIds,
  };
}

export interface HotelLoopResult {
  itinerary: Itinerary;
  bindings: HotelBinding[];
}

/** Apply confirmed hotels as day-loop anchors on an existing itinerary. */
export function applyHotelDayLoop(
  itinerary: Itinerary,
  hotels: ConfirmedHotelStay[],
  zones: RecommendedStayZone[] = [],
  flights?: Array<{ role?: string; depart_at?: string }>,
  opts?: ApplyHotelDayLoopOptions,
): HotelLoopResult {
  const named = hotels.filter((h) => h.name?.trim());
  if (!named.length) {
    return { itinerary, bindings: [] };
  }

  const n = itinerary.days.length;
  const departureDay = resolveDepartureDayIndex(itinerary, flights);
  const ordered = [...named].sort((a, b) => a.sequence - b.sequence);
  const scopeIds = opts?.scopeHotelIds?.filter(Boolean);
  const scoped = scopeIds?.length
    ? ordered.filter((h) => scopeIds.includes(h.id))
    : ordered;
  if (!scoped.length) {
    return {
      itinerary,
      bindings: (itinerary.meta?.hotel_bindings as HotelBinding[] | undefined) ?? [],
    };
  }

  const prevBindings = (itinerary.meta?.hotel_bindings as HotelBinding[] | undefined) ?? [];
  const dayOwner = new Map<number, ConfirmedHotelStay>();
  const daySlots = new Map<number, Set<Slot>>();

  for (const h of scoped) {
    let overnight =
      opts?.replaceHotelId != null
        ? daysFromReplaceBindings(opts.replaceHotelId, prevBindings, n)
        : [];
    if (!overnight.length) {
      overnight = dayIndicesForHotel(h, itinerary, zones, departureDay);
    }
    // Replace-in-place: only touch previously bound overnight days (no expand onto next day).
    if (opts?.replaceHotelId && overnight.length) {
      for (const i of overnight) {
        const slots = new Set<Slot>();
        if (i !== 0) slots.add('morning');
        if (departureDay == null || i !== departureDay) slots.add('evening');
        if (i === 0) {
          slots.add('evening');
          slots.delete('morning');
        }
        if (slots.size === 0) slots.add('evening');
        dayOwner.set(i, h);
        daySlots.set(i, slots);
      }
    } else {
      const loop = expandLoopDays(overnight, n, departureDay);
      for (const [i, slots] of loop) {
        dayOwner.set(i, h);
        daySlots.set(i, slots);
      }
    }
  }

  const scopedOnly = Boolean(scopeIds?.length || opts?.replaceHotelId);
  const newBindings: HotelBinding[] = [];
  const days = itinerary.days.map((day, i) => {
    const h = dayOwner.get(i);
    if (!h) return day;
    const slots = daySlots.get(i) ?? new Set<Slot>();
    const dayNum = day.day_index || i + 1;
    const placed = placeDayHotels(day.nodes, day.edges ?? [], h, i, dayNum, slots);
    for (const nid of placed.nodeIds) {
      newBindings.push({
        hotel_id: h.id,
        hotel_name: h.name.trim(),
        node_id: nid,
        day_index: dayNum,
      });
    }
    return { ...day, nodes: placed.nodes, edges: placed.edges };
  });

  const touchedDayNums = new Set(
    [...dayOwner.keys()].map((i) => itinerary.days[i]?.day_index || i + 1),
  );
  const keptBindings = scopedOnly
    ? prevBindings.filter((b) => !touchedDayNums.has(b.day_index || 0))
    : [];
  const bindings = [...keptBindings, ...newBindings];

  const cross_day_edges: ItineraryEdge[] = [];
  for (let i = 0; i < days.length - 1; i++) {
    const fromNodes = days[i].nodes;
    const toNodes = days[i + 1].nodes;
    if (!fromNodes.length || !toNodes.length) continue;
    const edge = estimateCommuteEdge(
      fromNodes[fromNodes.length - 1],
      toNodes[0],
      `xd-e${i + 1}`,
    );
    cross_day_edges.push({
      ...edge,
      transport_mode: edge.distance_meters != null && edge.distance_meters > 80000 ? 'flight' : 'taxi',
      label: '跨日衔接',
    });
  }

  const prevWarn = itinerary.meta?.warnings ?? [];
  const names = scoped
    .slice(0, 3)
    .map((h) => h.name.trim())
    .join('、');
  const note = scopedOnly
    ? `已更新酒店日闭环（仅当前住宿）：${names}`
    : `已按用户确认酒店锚定日闭环：${names}`;
  const warnings = prevWarn.includes(note)
    ? prevWarn
    : [...prevWarn.filter((w) => !w.includes('酒店锚定日闭环') && !w.includes('仅当前住宿')), note];

  return {
    itinerary: {
      ...itinerary,
      days,
      cross_day_edges,
      meta: {
        ...itinerary.meta,
        warnings,
        hotel_bindings: bindings,
      },
    },
    bindings,
  };
}

export function hasLockedHotel(hotels: ConfirmedHotelStay[] | undefined): boolean {
  return (hotels ?? []).some(isLockedHotelStay);
}

export function isLockedHotelStay(h: ConfirmedHotelStay): boolean {
  return (
    Boolean(h.name?.trim()) &&
    h.lat != null &&
    h.lng != null &&
    (Math.abs(h.lat) > 1e-6 || Math.abs(h.lng) > 1e-6) &&
    h.booking_status !== 'zone_only'
  );
}
