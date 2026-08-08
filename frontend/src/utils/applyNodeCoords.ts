import type { CoordConfidence, ItineraryNode } from '../types/itinerary';

export interface NodeCoordsPatch {
  lat: number;
  lng: number;
  address?: string;
  coord_confidence?: CoordConfidence;
  coord_source?: string;
  place_id?: string;
}

export function buildNodeCoordsPatch(
  lat: number,
  lng: number,
  options?: {
    address?: string;
    source?: string;
    confidence?: CoordConfidence;
    place_id?: string;
  },
): Partial<ItineraryNode> {
  return {
    lat,
    lng,
    coord_confidence: options?.confidence ?? 'manual',
    coord_source: options?.source ?? 'manual',
    ...(options?.address ? { address: options.address } : {}),
    ...(options?.place_id ? { place_id: options.place_id } : {}),
  };
}

export const COORD_CONFIDENCE_LABEL: Record<CoordConfidence, string> = {
  high: '高置信',
  medium: '待核实',
  low: '低置信',
  none: '未定位',
  manual: '已手动确认',
};

export const COORD_CONFIDENCE_TONE: Record<CoordConfidence, 'ok' | 'warn' | 'dim'> = {
  high: 'ok',
  medium: 'warn',
  low: 'warn',
  none: 'dim',
  manual: 'ok',
};
