import type { DayPlan, DayWeather, Itinerary, ItineraryEdge, ItineraryNode } from '../types/itinerary';
import { finalizeItineraryStructure } from './dayOrderMutations';
import {
  addCalendarDays,
  nextAvailableDateAfter,
  todayLocalDate,
  weekdayFromDate,
} from './dateUtils';
import { weatherIconLabel } from './formatWeather';

function dateAfter(dateStr: string, offsetDays: number): { date: string; weekday: string } {
  const date = addCalendarDays(dateStr, offsetDays);
  return { date, weekday: weekdayFromDate(date) };
}

export interface CreateDayOptions {
  insertIndex?: number;
  label?: string;
  region?: string;
  date?: string;
  copyWeatherFrom?: number;
}

export function createDefaultDay(
  itinerary: Itinerary,
  options: CreateDayOptions = {},
): DayPlan {
  const insertIndex = options.insertIndex ?? itinerary.days.length;
  const prevDay = insertIndex > 0 ? itinerary.days[insertIndex - 1] : null;
  const firstDay = itinerary.days[0];
  const dayNum = insertIndex + 1;

  let date = options.date;
  let weekday = '';
  if (date) {
    weekday = weekdayFromDate(date);
  } else if (insertIndex >= itinerary.days.length && itinerary.days.length > 0) {
    const allDates = itinerary.days.map((d) => d.date).filter(Boolean) as string[];
    const lastDate = itinerary.days[itinerary.days.length - 1]?.date;
    if (lastDate) {
      date = nextAvailableDateAfter(allDates, lastDate);
      weekday = weekdayFromDate(date);
    }
  } else if (
    insertIndex > 0 &&
    insertIndex < itinerary.days.length &&
    itinerary.days[insertIndex - 1]?.date
  ) {
    const allDates = itinerary.days.map((d) => d.date).filter(Boolean) as string[];
    const prevDate = itinerary.days[insertIndex - 1]!.date!;
    date = nextAvailableDateAfter(allDates, prevDate);
    weekday = weekdayFromDate(date);
  } else if (firstDay?.date) {
    const computed = dateAfter(firstDay.date, insertIndex);
    date = computed.date;
    weekday = computed.weekday;
  }

  if (!date) {
    date = todayLocalDate();
    weekday = weekdayFromDate(date);
  }

  const copiedWeather =
    options.copyWeatherFrom != null
      ? itinerary.days[options.copyWeatherFrom]?.weather
      : undefined;

  const defaultWeather: DayWeather = {
    temp_min: 22,
    temp_max: 30,
    icon: 'cloudy',
    description: weatherIconLabel('cloudy'),
    source: 'manual',
  };

  return {
    day_index: dayNum,
    label: options.label ?? `第 ${dayNum} 天`,
    date,
    weekday,
    region: options.region ?? prevDay?.region,
    nodes: [],
    edges: [],
    weather: copiedWeather ?? defaultWeather,
  };
}

export function reindexDays(days: DayPlan[]): DayPlan[] {
  return days.map((day, i) => ({ ...day, day_index: i + 1 }));
}

/** 追加或中间插入一天，并重排 day_index / node id / 跨日边 */
export function addDayToItinerary(
  itinerary: Itinerary,
  options: CreateDayOptions = {},
): Itinerary {
  const insertIndex = options.insertIndex ?? itinerary.days.length;
  const newDay = createDefaultDay(itinerary, { ...options, insertIndex });

  const days = [...itinerary.days];
  days.splice(insertIndex, 0, newDay);

  return finalizeItineraryStructure({ ...itinerary, days: reindexDays(days) }).itinerary;
}

export function nextNodeId(dayIndex: number, nodes: ItineraryNode[]): string {
  const dayNum = dayIndex + 1;
  const prefix = `d${dayNum}-n`;
  const nums = nodes
    .map((n) => n.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${next}`;
}

export function createDefaultNode(
  dayIndex: number,
  day: DayPlan,
  partial?: Partial<ItineraryNode>,
): ItineraryNode {
  const id = nextNodeId(dayIndex, day.nodes);
  return {
    ...partial,
    id,
    name: partial?.name ?? '新景点',
    category: partial?.category ?? 'attraction',
    lat: partial?.lat ?? 1.29,
    lng: partial?.lng ?? 103.86,
    is_optional: partial?.is_optional ?? false,
    region: partial?.region ?? day.region,
    coord_confidence: partial?.coord_confidence ?? 'none',
  };
}

export type NodeInsertPosition = 'start' | 'end';

export interface NodeInsertOptions {
  partial?: Partial<ItineraryNode>;
  insertAfter?: string;
  insertBefore?: string;
  position?: NodeInsertPosition;
}

function newPrimaryEdge(from: string, to: string): ItineraryEdge {
  return {
    id: `e-${from}-${to}`,
    from,
    to,
    type: 'primary',
    transport_mode: 'walk',
    duration_minutes: 15,
    label: '新增',
  };
}

/** 在单日行程中插入节点并重连 primary 边 */
export function insertNodeInDay(
  day: DayPlan,
  dayIndex: number,
  options: NodeInsertOptions = {},
): { day: DayPlan; nodeId: string } {
  const newNode = createDefaultNode(dayIndex, day, options.partial);
  const nodes = [...day.nodes];
  let edges = day.edges.map((e) => ({ ...e }));

  let insertIdx = nodes.length;
  if (options.position === 'start') {
    insertIdx = 0;
  } else if (options.insertBefore) {
    const idx = nodes.findIndex((n) => n.id === options.insertBefore);
    if (idx >= 0) insertIdx = idx;
  } else if (options.insertAfter) {
    const idx = nodes.findIndex((n) => n.id === options.insertAfter);
    if (idx >= 0) insertIdx = idx + 1;
  }

  nodes.splice(insertIdx, 0, newNode);

  if (options.insertAfter) {
    const anchorId = options.insertAfter;
    const outgoing = edges.filter((e) => e.from === anchorId && e.type === 'primary');
    edges.push(newPrimaryEdge(anchorId, newNode.id));
    edges = edges.map((e) =>
      outgoing.some((o) => o.id === e.id)
        ? { ...e, from: newNode.id, id: `e-${newNode.id}-${e.to}` }
        : e,
    );
  } else if (options.insertBefore) {
    const anchorId = options.insertBefore;
    const incoming = edges.filter((e) => e.to === anchorId && e.type === 'primary');
    edges.push(newPrimaryEdge(newNode.id, anchorId));
    edges = edges.map((e) =>
      incoming.some((o) => o.id === e.id)
        ? { ...e, to: newNode.id, id: `e-${e.from}-${newNode.id}` }
        : e,
    );
  } else if (options.position === 'start' && nodes.length > 1) {
    const firstOld = nodes.find((n) => n.id !== newNode.id);
    if (firstOld) {
      const incoming = edges.filter((e) => e.to === firstOld.id && e.type === 'primary');
      edges.push(newPrimaryEdge(newNode.id, firstOld.id));
      edges = edges.map((e) =>
        incoming.some((o) => o.id === e.id)
          ? { ...e, to: newNode.id, id: `e-${e.from}-${newNode.id}` }
          : e,
      );
    }
  } else if (insertIdx > 0) {
    const prev = nodes[insertIdx - 1];
    if (prev.id !== newNode.id) {
      edges.push(newPrimaryEdge(prev.id, newNode.id));
    }
  }

  return { day: { ...day, nodes, edges }, nodeId: newNode.id };
}

export function addNodeToItinerary(
  itinerary: Itinerary,
  dayIndex: number,
  options: NodeInsertOptions = {},
): { itinerary: Itinerary; nodeId: string } {
  const day = itinerary.days[dayIndex];
  if (!day) return { itinerary, nodeId: '' };

  const payload = { ...options };
  if (payload.insertAfter) {
    payload.position = undefined;
  } else if (!payload.insertBefore && !payload.position) {
    payload.position = 'end';
  }

  const { day: newDay, nodeId } = insertNodeInDay(day, dayIndex, payload);
  const days = itinerary.days.map((d, i) => (i === dayIndex ? newDay : d));
  return { itinerary: { ...itinerary, days }, nodeId };
}

export function removeNodeFromItinerary(
  itinerary: Itinerary,
  dayIndex: number,
  nodeId: string,
): Itinerary {
  const days = itinerary.days.map((day, i) => {
    if (i !== dayIndex) return day;
    return {
      ...day,
      nodes: day.nodes.filter((n) => n.id !== nodeId),
      edges: day.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    };
  });

  const cross_day_edges = (itinerary.cross_day_edges ?? []).filter(
    (e) => e.from !== nodeId && e.to !== nodeId,
  );

  return { ...itinerary, days, cross_day_edges };
}
