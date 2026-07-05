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
