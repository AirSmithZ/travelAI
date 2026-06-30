import type { DayPlan, Itinerary, ItineraryEdge, ItineraryNode } from '../types/itinerary';

export function makeEdgeId(from: string, to: string): string {
  return `e-${from}-${to}`;
}

export function createDefaultEdge(
  from: string,
  to: string,
  partial?: Partial<ItineraryEdge>,
): ItineraryEdge {
  return {
    type: partial?.type ?? 'primary',
    transport_mode: partial?.transport_mode ?? 'walk',
    duration_minutes: partial?.duration_minutes ?? 15,
    ...partial,
    id: partial?.id ?? makeEdgeId(from, to),
    from,
    to,
  };
}

export type EdgeContext =
  | { scope: 'day'; dayIndex: number; edge: ItineraryEdge }
  | { scope: 'cross_day'; edge: ItineraryEdge };

export function findEdgeContext(itinerary: Itinerary, edgeId: string): EdgeContext | null {
  for (let i = 0; i < itinerary.days.length; i++) {
    const edge = itinerary.days[i].edges.find((e) => e.id === edgeId);
    if (edge) return { scope: 'day', dayIndex: i, edge };
  }
  const cross = itinerary.cross_day_edges?.find((e) => e.id === edgeId);
  if (cross) return { scope: 'cross_day', edge: cross };
  return null;
}

export function sortNodesByPrimaryEdges(
  nodes: ItineraryNode[],
  edges: ItineraryEdge[],
): ItineraryNode[] {
  if (nodes.length <= 1) return nodes;

  const ids = new Set(nodes.map((n) => n.id));
  const primary = edges.filter(
    (e) => e.type === 'primary' && ids.has(e.from) && ids.has(e.to),
  );

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }

  for (const e of primary) {
    adj.get(e.from)!.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0);
  const sorted: ItineraryNode[] = [];

  while (queue.length > 0) {
    const n = queue.shift()!;
    if (sorted.some((s) => s.id === n.id)) continue;
    sorted.push(n);
    for (const next of adj.get(n.id) ?? []) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0 && nodeMap.has(next)) {
        queue.push(nodeMap.get(next)!);
      }
    }
  }

  for (const n of nodes) {
    if (!sorted.some((s) => s.id === n.id)) sorted.push(n);
  }

  return sorted;
}

export function connectNodesInDay(
  day: DayPlan,
  from: string,
  to: string,
  partial?: Partial<ItineraryEdge>,
): DayPlan {
  if (from === to) return day;
  const nodeIds = new Set(day.nodes.map((n) => n.id));
  if (!nodeIds.has(from) || !nodeIds.has(to)) return day;

  const type = partial?.type ?? 'primary';
  let edges = day.edges.filter((e) => !(e.from === from && e.to === to));

  if (type === 'primary') {
    const outgoing = edges.filter((e) => e.from === from && e.type === 'primary');
    edges = edges.filter((e) => !(e.from === from && e.type === 'primary'));
    edges.push(createDefaultEdge(from, to, { ...partial, type: 'primary' }));
    for (const out of outgoing) {
      if (out.to === to) continue;
      edges.push({
        ...out,
        from: to,
        id: makeEdgeId(to, out.to),
      });
    }
  } else {
    edges.push(createDefaultEdge(from, to, { ...partial, type: 'alternative' }));
  }

  return { ...day, edges };
}

export function addEdgeToDay(
  day: DayPlan,
  edge: Partial<ItineraryEdge> & { from: string; to: string },
): DayPlan {
  return connectNodesInDay(day, edge.from, edge.to, edge);
}

export function updateEdgeInDay(
  day: DayPlan,
  edgeId: string,
  patch: Partial<ItineraryEdge>,
): DayPlan {
  const idx = day.edges.findIndex((e) => e.id === edgeId);
  if (idx < 0) return day;

  const old = day.edges[idx];
  const from = patch.from ?? old.from;
  const to = patch.to ?? old.to;
  const next = createDefaultEdge(from, to, { ...old, ...patch });

  let edges = day.edges.filter((e) => e.id !== edgeId);
  edges = edges.filter((e) => !(e.from === from && e.to === to && e.id !== next.id));
  edges.push(next);

  return { ...day, edges };
}

export function removeEdgeFromDay(day: DayPlan, edgeId: string): DayPlan {
  return { ...day, edges: day.edges.filter((e) => e.id !== edgeId) };
}

export function updateCrossDayEdgeInItinerary(
  itinerary: Itinerary,
  edgeId: string,
  patch: Partial<ItineraryEdge>,
): Itinerary {
  const edges = (itinerary.cross_day_edges ?? []).map((e) => {
    if (e.id !== edgeId) return e;
    const from = patch.from ?? e.from;
    const to = patch.to ?? e.to;
    return createDefaultEdge(from, to, { ...e, ...patch });
  });
  return { ...itinerary, cross_day_edges: edges };
}

export function removeCrossDayEdgeFromItinerary(itinerary: Itinerary, edgeId: string): Itinerary {
  return {
    ...itinerary,
    cross_day_edges: (itinerary.cross_day_edges ?? []).filter((e) => e.id !== edgeId),
  };
}

export function connectNodesInItinerary(
  itinerary: Itinerary,
  dayIndex: number,
  from: string,
  to: string,
  partial?: Partial<ItineraryEdge>,
): Itinerary {
  const days = itinerary.days.map((day, i) =>
    i === dayIndex ? connectNodesInDay(day, from, to, partial) : day,
  );
  return { ...itinerary, days };
}

export function updateEdgeInItinerary(
  itinerary: Itinerary,
  dayIndex: number,
  edgeId: string,
  patch: Partial<ItineraryEdge>,
): Itinerary {
  const days = itinerary.days.map((day, i) =>
    i === dayIndex ? updateEdgeInDay(day, edgeId, patch) : day,
  );
  return { ...itinerary, days };
}

export function removeEdgeFromItinerary(
  itinerary: Itinerary,
  dayIndex: number,
  edgeId: string,
): Itinerary {
  const days = itinerary.days.map((day, i) =>
    i === dayIndex ? removeEdgeFromDay(day, edgeId) : day,
  );
  return { ...itinerary, days };
}

export function listEdgesForNode(
  day: DayPlan,
  nodeId: string,
): { outgoing: ItineraryEdge[]; incoming: ItineraryEdge[] } {
  return {
    outgoing: day.edges.filter((e) => e.from === nodeId),
    incoming: day.edges.filter((e) => e.to === nodeId),
  };
}
