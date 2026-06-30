import type { DayPlan } from '../types/itinerary';
import type { NodeInsertOptions } from './itineraryMutations';

export type InsertAnchor = '__start__' | '__end__' | string;

export function buildInsertOptions(anchor: InsertAnchor): NodeInsertOptions {
  if (anchor === '__start__') return { position: 'start' };
  if (anchor === '__end__') return { position: 'end' };
  return { insertAfter: anchor };
}

export function anchorLabel(anchor: InsertAnchor, day: DayPlan): string {
  if (anchor === '__start__') return '当天开头';
  if (anchor === '__end__') return '当天末尾';
  const node = day.nodes.find((n) => n.id === anchor);
  return node ? `在「${node.name}」之后` : anchor;
}

export function listInsertAnchors(day: DayPlan): { value: InsertAnchor; label: string }[] {
  const items: { value: InsertAnchor; label: string }[] = [
    { value: '__start__', label: '当天开头' },
  ];
  day.nodes.forEach((n) => {
    items.push({ value: n.id, label: `在「${n.name}」之后` });
  });
  items.push({ value: '__end__', label: '当天末尾' });
  return items;
}
