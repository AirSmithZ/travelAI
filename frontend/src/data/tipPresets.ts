import type { Itinerary } from '../types/itinerary';

export const DEFAULT_TIP_PRESETS = [
  '建议提前预约',
  '携带护照/证件',
  '需另购票',
  '可提前换票',
  '注意着装要求',
  '坐标待核实',
  '注意营业时间',
  '室内活动',
] as const;

export function collectTipPresets(itinerary: Itinerary | null): string[] {
  const fromNodes = new Set<string>();
  if (itinerary) {
    for (const day of itinerary.days) {
      for (const node of day.nodes) {
        for (const tip of node.tips ?? []) {
          if (tip.trim()) fromNodes.add(tip.trim());
        }
      }
    }
  }
  return [...new Set([...DEFAULT_TIP_PRESETS, ...fromNodes])];
}
