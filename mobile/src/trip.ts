import rawTrip from '../../frontend/src/data/anzTrip.json';
import type {
  CostQuote,
  DayPlan,
  Doc,
  Itinerary,
  QuoteCurrency,
  SaveNodeInput,
  TripEdge,
  TripNode,
} from './types';

const CURRENCIES = new Set<QuoteCurrency>(['CNY', 'AUD', 'NZD']);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asCurrency(value: unknown): QuoteCurrency {
  return typeof value === 'string' && CURRENCIES.has(value as QuoteCurrency)
    ? (value as QuoteCurrency)
    : 'CNY';
}

function cleanQuote(quote: CostQuote): CostQuote {
  return {
    ...quote,
    item: quote.item.trim(),
    currency: asCurrency(quote.currency),
    per_person: quote.per_person,
    party: quote.party,
    in_total: Boolean(quote.in_total),
    note: quote.note?.trim() || undefined,
  };
}

export function hasCoords(node: Pick<TripNode, 'lat' | 'lng'>): boolean {
  return Number.isFinite(node.lat) && Number.isFinite(node.lng) && !(node.lat === 0 && node.lng === 0);
}

export function seedDoc(): Doc {
  const itinerary = clone((rawTrip as { itinerary: Itinerary }).itinerary);
  return {
    origin: 'seed',
    savedAt: '',
    travelers: 4,
    itinerary,
  };
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clampDayIndex(doc: Doc, dayIndex: number): number {
  if (doc.itinerary.days.length === 0) return 0;
  return Math.min(Math.max(dayIndex, 0), doc.itinerary.days.length - 1);
}

export function findNode(doc: Doc, nodeId: string): { dayIndex: number; day: DayPlan; node: TripNode } | null {
  for (let dayIndex = 0; dayIndex < doc.itinerary.days.length; dayIndex += 1) {
    const day = doc.itinerary.days[dayIndex];
    const node = day.nodes.find((item) => item.id === nodeId);
    if (node) return { dayIndex, day, node };
  }
  return null;
}

export function previousInDay(day: DayPlan, nodeId: string | null): TripNode | null {
  if (!nodeId) return day.nodes[day.nodes.length - 1] ?? null;
  const index = day.nodes.findIndex((node) => node.id === nodeId);
  if (index <= 0) return null;
  return day.nodes[index - 1] ?? null;
}

export function incomingEdge(doc: Doc, nodeId: string): TripEdge | null {
  for (const day of doc.itinerary.days) {
    const edge = day.edges.find((item) => item.to === nodeId);
    if (edge) return edge;
  }
  return doc.itinerary.cross_day_edges?.find((item) => item.to === nodeId) ?? null;
}

export function blankNode(day: DayPlan, id: string): TripNode {
  const prev = [...day.nodes].reverse().find((node) => hasCoords(node));
  return {
    id,
    name: '',
    category: 'attraction',
    lat: prev ? Math.round((prev.lat + 0.002) * 1e6) / 1e6 : 0,
    lng: prev ? Math.round((prev.lng + 0.002) * 1e6) / 1e6 : 0,
    is_optional: false,
    tips: [],
    cost_quotes: [],
    region: day.region,
    coord_confidence: prev ? 'manual' : 'none',
    coord_source: '手机端',
  };
}

function touch(doc: Doc): Doc {
  doc.origin = 'local';
  doc.savedAt = new Date().toISOString();
  return doc;
}

export function applySave(doc: Doc, input: SaveNodeInput): Doc {
  const next = touch(clone(doc));
  const day = next.itinerary.days[input.dayIndex];
  if (!day) return next;
  const node: TripNode = {
    ...input.node,
    name: input.node.name.trim(),
    cost_quotes: (input.node.cost_quotes ?? []).map(cleanQuote).filter((quote) => quote.item),
    tips: (input.node.tips ?? []).map((tip) => tip.trim()).filter(Boolean),
  };
  if (input.mode === 'create') {
    day.nodes.push(node);
  } else {
    const index = day.nodes.findIndex((item) => item.id === node.id);
    if (index >= 0) {
      const previous = day.nodes[index];
      if (previous.lat !== node.lat || previous.lng !== node.lng) {
        node.coord_confidence = 'manual';
        node.coord_source = '手机端手动';
      }
      day.nodes[index] = { ...previous, ...node, id: previous.id };
    }
  }
  if (input.edge) {
    const edge = input.edge;
    const inDay = day.edges.findIndex((item) => item.id === edge.id);
    if (inDay >= 0) {
      day.edges[inDay] = edge;
    } else {
      const cross = next.itinerary.cross_day_edges ?? [];
      const inCross = cross.findIndex((item) => item.id === edge.id);
      if (inCross >= 0) {
        cross[inCross] = edge;
        next.itinerary.cross_day_edges = cross;
      } else {
        day.edges.push(edge);
      }
    }
  }
  return next;
}

export function applyDelete(doc: Doc, nodeId: string): Doc {
  const next = touch(clone(doc));
  for (const day of next.itinerary.days) {
    day.nodes = day.nodes.filter((node) => node.id !== nodeId);
    day.edges = day.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  }
  if (next.itinerary.cross_day_edges) {
    next.itinerary.cross_day_edges = next.itinerary.cross_day_edges.filter(
      (edge) => edge.from !== nodeId && edge.to !== nodeId,
    );
  }
  return next;
}

export function applyTravelers(doc: Doc, travelers: number): Doc {
  const next = touch(clone(doc));
  next.travelers = Math.min(12, Math.max(1, Math.round(travelers)));
  return next;
}

export function applyExtras(doc: Doc, extras: CostQuote[]): Doc {
  const next = touch(clone(doc));
  next.itinerary.meta = {
    ...next.itinerary.meta,
    expense_extras: extras.map(cleanQuote).filter((quote) => quote.item),
  };
  return next;
}

export interface QuoteRow {
  key: string;
  day: number | null;
  nodeId: string | null;
  name: string;
  quote: CostQuote;
}

export function collectQuotes(doc: Doc, dayIndex: number | null): QuoteRow[] {
  const rows: QuoteRow[] = [];
  const days = dayIndex == null ? doc.itinerary.days : doc.itinerary.days.filter((_, index) => index === dayIndex);
  for (const day of days) {
    for (const node of day.nodes) {
      for (const [index, quote] of (node.cost_quotes ?? []).entries()) {
        rows.push({
          key: `${node.id}-${index}`,
          day: day.day_index,
          nodeId: node.id,
          name: node.name,
          quote,
        });
      }
    }
  }
  if (dayIndex == null) {
    for (const [index, quote] of (doc.itinerary.meta.expense_extras ?? []).entries()) {
      rows.push({
        key: `extra-${index}`,
        day: null,
        nodeId: null,
        name: quote.item,
        quote,
      });
    }
  }
  return rows;
}

export interface MapPoint {
  id: string;
  name: string;
  lng: number;
  lat: number;
  color: string;
  optional: boolean;
}

type GeoProps = Record<string, string | number | null>;

interface GeoFeature {
  type: 'Feature';
  properties: GeoProps;
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] };
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

export interface MapModel {
  points: FeatureCollection;
  lines: FeatureCollection;
  located: MapPoint[];
}

function jitter(nodes: TripNode[]): Map<string, { lng: number; lat: number }> {
  const groups = new Map<string, TripNode[]>();
  for (const node of nodes) {
    if (!hasCoords(node)) continue;
    const key = `${node.lat.toFixed(4)},${node.lng.toFixed(4)}`;
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  const out = new Map<string, { lng: number; lat: number }>();
  for (const list of groups.values()) {
    list.forEach((node, index) => {
      if (index === 0) {
        out.set(node.id, { lng: node.lng, lat: node.lat });
        return;
      }
      const angle = (index / list.length) * Math.PI * 2;
      const radius = 0.00045 * Math.ceil(index / 8);
      out.set(node.id, {
        lng: node.lng + Math.cos(angle) * radius,
        lat: node.lat + Math.sin(angle) * radius,
      });
    });
  }
  return out;
}

export function buildMapModel(
  days: DayPlan[],
  crossEdges: TripEdge[],
  includeCross: boolean,
  selectedId: string | null,
  colorOf: (category: string) => string,
): MapModel {
  const nodes = days.flatMap((day) => day.nodes);
  const display = jitter(nodes);
  const located: MapPoint[] = [];
  const pointFeatures: GeoFeature[] = [];
  for (const node of nodes) {
    const spot = display.get(node.id);
    if (!spot) continue;
    const color = colorOf(node.category);
    located.push({ id: node.id, name: node.name, ...spot, color, optional: node.is_optional });
    pointFeatures.push({
      type: 'Feature',
      properties: {
        id: node.id,
        name: node.name,
        color,
        optional: node.is_optional ? 1 : 0,
        selected: node.id === selectedId ? 1 : 0,
      },
      geometry: { type: 'Point', coordinates: [spot.lng, spot.lat] },
    });
  }
  const edges = days.flatMap((day) => day.edges);
  if (includeCross) {
    for (const edge of crossEdges) {
      if (display.has(edge.from) && display.has(edge.to)) edges.push(edge);
    }
  }
  const lineFeatures: GeoFeature[] = [];
  for (const edge of edges) {
    const from = display.get(edge.from);
    const to = display.get(edge.to);
    if (!from || !to || edge.from === edge.to) continue;
    lineFeatures.push({
      type: 'Feature',
      properties: { alt: edge.type === 'alternative' ? 1 : 0 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
    });
  }
  return {
    located,
    points: { type: 'FeatureCollection', features: pointFeatures },
    lines: { type: 'FeatureCollection', features: lineFeatures },
  };
}

/** 精度圈，半径单位是米。 */
export function accuracyRing(lng: number, lat: number, radiusM: number): FeatureCollection {
  const steps = 48;
  const earth = 6378137;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * Math.PI * 2;
    const dx = radiusM * Math.cos(bearing);
    const dy = radiusM * Math.sin(bearing);
    const dLat = (dy / earth) * (180 / Math.PI);
    const dLng = (dx / (earth * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
    ring.push([lng + dLng, lat + dLat]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  };
}

export function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
