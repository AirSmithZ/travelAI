import type {
  StayZoneRecommendRequest,
  StayZoneRecommendResponse,
} from '../types/stayZone';

const TIMEOUT_MS = 90_000;

function apiBase(): string {
  return import.meta.env.VITE_API_BASE ?? '';
}

async function readError(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const errBody = (await res.json()) as { detail?: string };
    if (errBody.detail) detail = errBody.detail;
  } catch {
    /* ignore */
  }
  return detail;
}

export async function recommendStayZones(
  body: StayZoneRecommendRequest,
): Promise<StayZoneRecommendResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}/api/v1/stay-zones/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        trip_request: body.trip_request,
        flights: body.flights,
        itinerary: body.itinerary ?? null,
        preferences: body.preferences,
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as StayZoneRecommendResponse;
  } finally {
    clearTimeout(timer);
  }
}

export interface StayZoneLodgingCandidate {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  place_id?: string | null;
  rating?: number | null;
  distance_m: number;
  coord_source?: string;
}

export async function searchStayZoneLodging(body: {
  zone_id: string;
  city: string;
  label?: string;
  lat: number;
  lng: number;
  radius_m?: number;
  limit?: number;
}): Promise<{ candidates: StayZoneLodgingCandidate[]; warnings: string[] }> {
  const res = await fetch(`${apiBase()}/api/v1/stay-zones/lodging`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout?.(40_000),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as {
    candidates: StayZoneLodgingCandidate[];
    warnings?: string[];
  };
  return { candidates: data.candidates ?? [], warnings: data.warnings ?? [] };
}
