import type { GeoJSONSource } from 'maplibre-gl';
import type { RecommendedStayZone } from '../types/stayZone';
import { isValidMapCoord } from './mapCoordGuards';

function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = Math.max(Math.abs(111_320 * Math.cos(latRad)), 1e-3);
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
    .map((zone, index) => {
      const geom = zone.geometry!;
      let coordinates: [number, number][][] = [];
      if (geom.type === 'circle') {
        const { lat, lng } = geom.center ?? { lat: NaN, lng: NaN };
        if (!isValidMapCoord(Number(lat), Number(lng))) return null;
        coordinates = [circlePolygon({ lat: Number(lat), lng: Number(lng) }, geom.radius_m)];
      } else if (geom.coordinates.length >= 3) {
        const ring = geom.coordinates.filter(([lng, lat]) =>
          isValidMapCoord(Number(lat), Number(lng)),
        );
        if (ring.length < 3) return null;
        coordinates = [ring];
      }
      if (coordinates.length === 0) return null;
      return {
        type: 'Feature' as const,
        // Numeric Feature.id — same rationale as itinerary / hotel pins (MapLibre quirks)
        id: index + 1,
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

/** @returns whether source/layers exist and are writable */
export function ensureStayZoneLayers(
  map: maplibregl.Map,
  beforeLayerId?: string,
): boolean {
  if (!map.isStyleLoaded()) return false;

  try {
    if (!map.getSource(STAY_ZONE_SOURCE)) {
      map.addSource(STAY_ZONE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    const before =
      beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined;

    if (!map.getLayer(STAY_ZONE_FILL)) {
      map.addLayer(
        {
          id: STAY_ZONE_FILL,
          type: 'fill',
          source: STAY_ZONE_SOURCE,
          paint: {
            // Dark basemap: stronger fill so 800m circles read at city zoom
            'fill-color': [
              'case',
              ['boolean', ['get', 'confirmed'], false],
              'rgba(26, 127, 75, 0.38)',
              'rgba(245, 158, 11, 0.32)',
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['get', 'selected'], false],
              0.85,
              0.55,
            ],
          },
        },
        before,
      );
    } else if (before) {
      try {
        map.moveLayer(STAY_ZONE_FILL, before);
      } catch {
        /* ignore if already ordered */
      }
    }

    if (!map.getLayer(STAY_ZONE_LINE)) {
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
              '#f59e0b',
            ],
            'line-width': [
              'case',
              ['boolean', ['get', 'selected'], false],
              3.5,
              2.5,
            ],
            'line-opacity': 0.95,
          },
        },
        before,
      );
    } else if (before) {
      try {
        map.moveLayer(STAY_ZONE_LINE, before);
      } catch {
        /* ignore */
      }
    }
  } catch {
    return false;
  }

  return Boolean(map.getSource(STAY_ZONE_SOURCE) && map.getLayer(STAY_ZONE_FILL));
}

/** @returns false if style not ready / source missing（调用方应重试，勿记 fitKey） */
export function updateStayZoneSource(
  map: maplibregl.Map,
  zones: RecommendedStayZone[],
  selectedZoneId: string | null,
  beforeLayerId?: string,
): boolean {
  if (!ensureStayZoneLayers(map, beforeLayerId)) return false;
  const src = map.getSource(STAY_ZONE_SOURCE) as GeoJSONSource | undefined;
  if (!src) return false;
  src.setData(zonesToGeoJSON(zones, selectedZoneId));
  return true;
}
