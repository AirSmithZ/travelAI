import type { GeoJSONSource } from 'maplibre-gl';
import type { RecommendedStayZone } from '../types/stayZone';

function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(latRad);
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = (radiusM * Math.cos(angle)) / mPerDegLng;
    const dy = (radiusM * Math.sin(angle)) / mPerDegLat;
    coords.push([center.lng + dx, center.lat + dy]);
  }
  return coords;
}

export function zonesToGeoJSON(
  zones: RecommendedStayZone[],
  selectedZoneId: string | null,
) {
  const features = zones
    .filter((z) => z.geometry && z.status !== 'rejected')
    .map((zone) => {
      const geom = zone.geometry!;
      let coordinates: [number, number][][] = [];
      if (geom.type === 'circle') {
        coordinates = [circlePolygon(geom.center, geom.radius_m)];
      } else if (geom.coordinates.length >= 3) {
        coordinates = [geom.coordinates];
      }
      if (coordinates.length === 0) return null;
      return {
        type: 'Feature' as const,
        id: zone.id,
        properties: {
          id: zone.id,
          label: zone.label,
          selected: zone.id === selectedZoneId,
          confirmed: zone.status === 'confirmed',
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates,
        },
      };
    })
    .filter(Boolean);

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

export const STAY_ZONE_SOURCE = 'stay-zones';
export const STAY_ZONE_FILL = 'stay-zone-fill';
export const STAY_ZONE_LINE = 'stay-zone-line';

export function ensureStayZoneLayers(map: maplibregl.Map, beforeLayerId?: string) {
  if (!map.isStyleLoaded() || map.getSource(STAY_ZONE_SOURCE)) return;

  map.addSource(STAY_ZONE_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer(
    {
      id: STAY_ZONE_FILL,
      type: 'fill',
      source: STAY_ZONE_SOURCE,
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['get', 'confirmed'], false],
          'rgba(26, 127, 75, 0.18)',
          'rgba(99, 102, 212, 0.14)',
        ],
        'fill-opacity': [
          'case',
          ['boolean', ['get', 'selected'], false],
          0.55,
          0.35,
        ],
      },
    },
    beforeLayerId,
  );

  map.addLayer(
    {
      id: STAY_ZONE_LINE,
      type: 'line',
      source: STAY_ZONE_SOURCE,
      paint: {
        'line-color': [
          'case',
          ['boolean', ['get', 'confirmed'], false],
          '#1a7f4b',
          '#6366d4',
        ],
        'line-width': [
          'case',
          ['boolean', ['get', 'selected'], false],
          2.5,
          1.5,
        ],
        'line-opacity': 0.85,
      },
    },
    beforeLayerId,
  );
}

export function updateStayZoneSource(
  map: maplibregl.Map,
  zones: RecommendedStayZone[],
  selectedZoneId: string | null,
  beforeLayerId?: string,
) {
  ensureStayZoneLayers(map, beforeLayerId);
  const src = map.getSource(STAY_ZONE_SOURCE) as GeoJSONSource | undefined;
  const data = zonesToGeoJSON(zones, selectedZoneId);
  if (src) {
    src.setData(data);
  }
}
