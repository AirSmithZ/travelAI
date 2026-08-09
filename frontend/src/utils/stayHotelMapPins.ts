import maplibregl from 'maplibre-gl';
import { isValidMapCoord } from './mapCoordGuards';

/** Preview pins for zone lodging candidates / locked hotels (pre-itinerary). */
export interface StayHotelMapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  selected?: boolean;
}

function truncateLabel(name: string, max = 22): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** P108: DOM markers — GeoJSON circle layers were silently empty after style/opacity races. */
export function syncStayHotelDomMarkers(
  map: maplibregl.Map,
  pins: StayHotelMapPin[],
  existing: maplibregl.Marker[],
  onSelect?: (pin: StayHotelMapPin) => void,
): maplibregl.Marker[] {
  clearStayHotelDomMarkers(existing);

  const next: maplibregl.Marker[] = [];
  for (const p of pins) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!isValidMapCoord(lat, lng)) continue;

    const el = document.createElement('button');
    el.type = 'button';
    el.className = `stay-hotel-marker${p.selected ? ' stay-hotel-marker--selected' : ''}`;
    el.title = p.name;
    el.setAttribute('aria-label', p.name);
    if (onSelect) {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onSelect(p);
      });
    }

    const dot = document.createElement('span');
    dot.className = 'stay-hotel-marker__dot';
    el.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'stay-hotel-marker__label';
    label.textContent = truncateLabel(p.name);
    el.appendChild(label);

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' });
    marker.setLngLat([lng, lat]).addTo(map);
    next.push(marker);
  }
  return next;
}

export function clearStayHotelDomMarkers(markers: maplibregl.Marker[]) {
  for (const m of markers) {
    try {
      m.remove();
    } catch {
      /* ignore */
    }
  }
}
