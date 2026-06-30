import type { DayPlan, Itinerary, ItineraryEdge } from '../types/itinerary';
import { reindexDays } from './itineraryMutations';

function nodeIdSuffix(id: string): string {
  const idx = id.indexOf('-n');
  return idx >= 0 ? id.slice(idx + 2) : id;
}

function remapEdgeEndpoints(
  edge: ItineraryEdge,
  idMap: Map<string, string>,
): ItineraryEdge {
  const from = idMap.get(edge.from) ?? edge.from;
  const to = idMap.get(edge.to) ?? edge.to;
  const id =
    edge.id.startsWith('e-') && edge.id.includes(edge.from) && edge.id.includes(edge.to)
      ? `e-${from}-${to}`
      : edge.id;
  return { ...edge, id, from, to };
}

/** 按当前 days[] 槽位重编 dN-n* 前缀，并同步边引用 */
export function migrateItineraryNodeIds(itinerary: Itinerary): {
  itinerary: Itinerary;
  nodeIdMap: Map<string, string>;
} {
  const nodeIdMap = new Map<string, string>();

  const days = itinerary.days.map((day, dayIndex) => {
    const dayNum = dayIndex + 1;
    const nodes = day.nodes.map((node) => {
      const suffix = nodeIdSuffix(node.id);
      const newId = `d${dayNum}-n${suffix}`;
      nodeIdMap.set(node.id, newId);
      return node.id === newId ? node : { ...node, id: newId };
    });
    const edges = day.edges.map((e) => remapEdgeEndpoints(e, nodeIdMap));
    return { ...day, nodes, edges, day_index: dayNum };
  });

  const cross_day_edges = (itinerary.cross_day_edges ?? []).map((e) =>
    remapEdgeEndpoints(e, nodeIdMap),
  );

  return {
    itinerary: { ...itinerary, days, cross_day_edges },
    nodeIdMap,
  };
}

/** 按相邻槽位重建跨日边，尽量保留已有属性 */
export function rebuildCrossDayEdges(itinerary: Itinerary): Itinerary {
  const oldEdges = itinerary.cross_day_edges ?? [];
  const cross_day_edges: ItineraryEdge[] = [];

  for (let i = 0; i < itinerary.days.length - 1; i++) {
    const prev = itinerary.days[i];
    const next = itinerary.days[i + 1];
    if (!prev.nodes.length || !next.nodes.length) continue;

    const from = prev.nodes[prev.nodes.length - 1].id;
    const to = next.nodes[0].id;
    const slotId = `xd-${i + 1}-${i + 2}`;
    const existing =
      oldEdges.find((e) => e.from === from && e.to === to) ??
      oldEdges.find((e) => e.id === slotId);

    cross_day_edges.push({
      id: slotId,
      from,
      to,
      type: existing?.type ?? 'primary',
      transport_mode: existing?.transport_mode ?? 'walk',
      duration_minutes: existing?.duration_minutes ?? 0,
      distance_meters: existing?.distance_meters,
      depart_time: existing?.depart_time,
      arrive_time: existing?.arrive_time,
      label: existing?.label ?? '跨日衔接',
    });
  }

  return { ...itinerary, cross_day_edges };
}

export function finalizeItineraryStructure(itinerary: Itinerary): {
  itinerary: Itinerary;
  nodeIdMap: Map<string, string>;
} {
  const { itinerary: withIds, nodeIdMap } = migrateItineraryNodeIds(itinerary);
  return { itinerary: rebuildCrossDayEdges(withIds), nodeIdMap };
}

/** 将单一 day 从 fromIndex 移到 toIndex（整体搬 DayPlan） */
export function moveDayInItinerary(
  itinerary: Itinerary,
  fromIndex: number,
  toIndex: number,
): { itinerary: Itinerary; nodeIdMap: Map<string, string> } {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= itinerary.days.length ||
    toIndex >= itinerary.days.length
  ) {
    return { itinerary, nodeIdMap: new Map() };
  }

  const days = [...itinerary.days];
  const [moved] = days.splice(fromIndex, 1);
  days.splice(toIndex, 0, moved);

  return finalizeItineraryStructure({ ...itinerary, days: reindexDays(days) });
}

/** 按 day.date 稳定排序 days[] */
export function reorderItineraryDaysByDate(itinerary: Itinerary): {
  itinerary: Itinerary;
  indexMap: Map<number, number>;
  nodeIdMap: Map<string, string>;
} {
  const indexed = itinerary.days.map((day, oldIndex) => ({ day, oldIndex }));
  indexed.sort((a, b) => {
    const da = a.day.date || '9999-12-31';
    const db = b.day.date || '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    return a.oldIndex - b.oldIndex;
  });

  const indexMap = new Map<number, number>();
  indexed.forEach(({ oldIndex }, newIndex) => indexMap.set(oldIndex, newIndex));

  const days = reindexDays(indexed.map(({ day }) => day));
  const { itinerary: next, nodeIdMap } = finalizeItineraryStructure({
    ...itinerary,
    days,
  });

  return { itinerary: next, indexMap, nodeIdMap };
}

/** 删除指定槽位；至少保留一天 */
export function removeDayFromItinerary(
  itinerary: Itinerary,
  dayIndex: number,
): { itinerary: Itinerary; nodeIdMap: Map<string, string> } | null {
  if (dayIndex < 0 || dayIndex >= itinerary.days.length || itinerary.days.length <= 1) {
    return null;
  }

  const days = itinerary.days.filter((_, i) => i !== dayIndex);
  return finalizeItineraryStructure({ ...itinerary, days: reindexDays(days) });
}

export function permuteOverviewColumnWidths(
  widths: number[],
  indexMap: Map<number, number>,
  dayCount: number,
): number[] {
  if (widths.length === 0) return [];
  const result = new Array<number>(dayCount).fill(0);
  for (let oldIdx = 0; oldIdx < dayCount; oldIdx++) {
    const newIdx = indexMap.get(oldIdx) ?? oldIdx;
    result[newIdx] = widths[oldIdx] ?? 0;
  }
  return result;
}

export function spliceOverviewColumnWidth(
  widths: number[],
  insertIndex: number,
  value = 0,
): number[] {
  const next = [...widths];
  next.splice(insertIndex, 0, value);
  return next;
}

export function removeOverviewColumnWidth(widths: number[], removeIndex: number): number[] {
  return widths.filter((_, i) => i !== removeIndex);
}

/** 列头摘要：N 站 · 通勤时长 */
export function formatDayHeaderStats(day: DayPlan): string | null {
  const stops = day.nodes.length;
  if (stops === 0) return null;

  const commuteMin = day.edges.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
  if (commuteMin >= 60) {
    const h = Math.floor(commuteMin / 60);
    const m = commuteMin % 60;
    return m > 0 ? `${stops} 站 · ${h}h${m}m` : `${stops} 站 · ${h}h`;
  }
  return commuteMin > 0 ? `${stops} 站 · ${commuteMin}min` : `${stops} 站`;
}
