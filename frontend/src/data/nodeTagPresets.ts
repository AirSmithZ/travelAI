import type { Itinerary } from '../types/itinerary';

export const DEFAULT_NODE_TAG_PRESETS = [
  '必去',
  '亲子',
  '美食',
  '室内',
  '夜景',
  '免费',
  '预约',
  '购物',
  '网红',
  '户外',
] as const;

export function collectNodeTagPresets(itinerary: Itinerary | null): string[] {
  const fromNodes = new Set<string>();
  if (itinerary) {
    for (const day of itinerary.days) {
      for (const node of day.nodes) {
        for (const tag of node.tags ?? []) {
          if (tag.trim()) fromNodes.add(tag.trim());
        }
      }
    }
  }
  return [...new Set([...DEFAULT_NODE_TAG_PRESETS, ...fromNodes])];
}
