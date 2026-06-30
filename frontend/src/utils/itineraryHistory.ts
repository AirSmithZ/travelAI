import type { Itinerary } from '../types/itinerary';

export const ITINERARY_HISTORY_MAX = 50;

export interface ItineraryHistoryStacks {
  past: Itinerary[];
  future: Itinerary[];
}

export function cloneItinerary(itinerary: Itinerary): Itinerary {
  return structuredClone(itinerary);
}

export function pushItineraryHistory(
  stacks: ItineraryHistoryStacks | undefined,
  snapshot: Itinerary,
): ItineraryHistoryStacks {
  const past = [...(stacks?.past ?? []), cloneItinerary(snapshot)].slice(-ITINERARY_HISTORY_MAX);
  return { past, future: [] };
}

export function popItineraryUndo(
  stacks: ItineraryHistoryStacks,
  current: Itinerary,
): { stacks: ItineraryHistoryStacks; itinerary: Itinerary } | null {
  if (stacks.past.length === 0) return null;
  const previous = stacks.past[stacks.past.length - 1];
  const past = stacks.past.slice(0, -1);
  const future = [cloneItinerary(current), ...stacks.future].slice(0, ITINERARY_HISTORY_MAX);
  return {
    stacks: { past, future },
    itinerary: cloneItinerary(previous),
  };
}

export function popItineraryRedo(
  stacks: ItineraryHistoryStacks,
  current: Itinerary,
): { stacks: ItineraryHistoryStacks; itinerary: Itinerary } | null {
  if (stacks.future.length === 0) return null;
  const next = stacks.future[0];
  const future = stacks.future.slice(1);
  const past = [...stacks.past, cloneItinerary(current)].slice(-ITINERARY_HISTORY_MAX);
  return {
    stacks: { past, future },
    itinerary: cloneItinerary(next),
  };
}
