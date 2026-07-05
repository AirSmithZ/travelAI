import type { Itinerary } from '../types/itinerary';
import type { RecommendedStayZone } from '../types/stayZone';
import { addNodeToItinerary } from './itineraryMutations';

export interface AddHotelForZoneOptions {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  coord_source?: string;
}

/** 在覆盖段首日末插入 hotel 节点（首版：每 segment 一个节点）。 */
export function addHotelNodeForZone(
  itinerary: Itinerary,
  zone: RecommendedStayZone,
  opts: AddHotelForZoneOptions,
): { itinerary: Itinerary; nodeId: string; dayIndex: number } {
  const covers = zone.covers_day_indices?.length
    ? zone.covers_day_indices
    : [0];
  const dayIndex = Math.min(...covers);
  const day = itinerary.days[dayIndex];
  const region = day?.region ?? zone.label;

  const { itinerary: next, nodeId } = addNodeToItinerary(itinerary, dayIndex, {
    position: 'end',
    partial: {
      name: opts.name.trim() || '酒店（待命名）',
      category: 'hotel',
      lat: opts.lat,
      lng: opts.lng,
      address: opts.address,
      region,
      coord_confidence: opts.coord_source === 'map_pick' ? 'manual' : 'medium',
      coord_source: opts.coord_source ?? 'geocode',
      start_time: '21:00',
      end_time: '08:00',
      cost_label: '住宿',
    },
  });

  return { itinerary: next, nodeId, dayIndex };
}

export function zoneDefaultHotelName(zone: RecommendedStayZone): string {
  return `${zone.label} 附近酒店`;
}

export function zoneFallbackCoords(zone: RecommendedStayZone): { lat: number; lng: number } | null {
  const g = zone.geometry;
  if (g?.type === 'circle') return g.center;
  if (g?.type === 'polygon' && g.coordinates[0]) {
    const [lng, lat] = g.coordinates[0];
    return { lat, lng };
  }
  return null;
}
