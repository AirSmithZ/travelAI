import type { Itinerary } from '../types/itinerary';
import { collectRegionsInOrder } from './layoutOverview';
import { getNodeRegion } from './nodeRegion';

export function regionExists(itinerary: Itinerary, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return collectRegionsInOrder(itinerary.days).includes(trimmed);
}

export function countNodesInRegion(itinerary: Itinerary, region: string): number {
  let count = 0;
  itinerary.days.forEach((day) => {
    day.nodes.forEach((node) => {
      if (getNodeRegion(node, day) === region) count += 1;
    });
  });
  return count;
}

export function renameRegionInItinerary(
  itinerary: Itinerary,
  oldName: string,
  newName: string,
): Itinerary {
  const next = newName.trim();
  if (!next || oldName === next) return itinerary;

  const days = itinerary.days.map((day) => ({
    ...day,
    region: day.region?.trim() === oldName ? next : day.region,
    nodes: day.nodes.map((node) => ({
      ...node,
      region: node.region?.trim() === oldName ? next : node.region,
    })),
  }));

  return { ...itinerary, days };
}

export function addRegionToItinerary(
  itinerary: Itinerary,
  name: string,
  dayIndex: number,
): Itinerary {
  const trimmed = name.trim();
  if (!trimmed || regionExists(itinerary, trimmed)) return itinerary;
  if (dayIndex < 0 || dayIndex >= itinerary.days.length) return itinerary;

  const days = itinerary.days.map((day, i) =>
    i === dayIndex ? { ...day, region: trimmed } : day,
  );
  return { ...itinerary, days };
}

export function listAllRegions(itinerary: Itinerary): string[] {
  return collectRegionsInOrder(itinerary.days);
}

/** 当日主区域变更时，可被 cascade 的节点数 */
export function countDayNodesForRegionSync(
  itinerary: Itinerary,
  dayIndex: number,
  oldRegion: string | undefined,
): number {
  const day = itinerary.days[dayIndex];
  if (!day) return 0;
  const oldTrim = oldRegion?.trim() || '';
  return day.nodes.filter((node) => {
    const nr = node.region?.trim();
    return !nr || (oldTrim !== '' && nr === oldTrim);
  }).length;
}

/** 改 day.region 时，同步当日隐式或等于旧主区域的 node.region */
export function syncDayRegionToNodes(
  itinerary: Itinerary,
  dayIndex: number,
  oldRegion: string | undefined,
  newRegion: string | undefined,
): Itinerary {
  const newTrim = newRegion?.trim();
  if (!newTrim) {
    const days = itinerary.days.map((day, i) =>
      i === dayIndex ? { ...day, region: undefined } : day,
    );
    return { ...itinerary, days };
  }

  const oldTrim = oldRegion?.trim() || '';
  const days = itinerary.days.map((day, i) => {
    if (i !== dayIndex) return day;
    return {
      ...day,
      region: newTrim,
      nodes: day.nodes.map((node) => {
        const nr = node.region?.trim();
        if (!nr || (oldTrim && nr === oldTrim)) {
          return { ...node, region: newTrim };
        }
        return node;
      }),
    };
  });
  return { ...itinerary, days };
}
