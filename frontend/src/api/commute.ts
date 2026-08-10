import type { RouteSource, TransportMode } from '../types/itinerary';

export interface CommutePoint {
  lat: number;
  lng: number;
  name?: string;
}

export interface CommuteCandidate {
  transport_mode: TransportMode;
  duration_minutes: number;
  distance_meters?: number | null;
  label: string;
  summary: string;
  source: RouteSource;
  recommended: boolean;
  fare_estimate?: number | null;
  currency?: string | null;
}

export interface CommuteLookupResponse {
  candidates: CommuteCandidate[];
  warnings: string[];
  provider?: string | null;
  straight_line_meters?: number | null;
}

export class CommuteApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CommuteApiError';
    this.status = status;
  }
}

const apiBase = () => import.meta.env.VITE_API_BASE ?? '';

export async function lookupCommute(body: {
  from_point: CommutePoint;
  to_point: CommutePoint;
  free_text?: string;
  notes?: string;
  use_directions?: boolean;
}): Promise<CommuteLookupResponse> {
  const res = await fetch(`${apiBase()}/api/v1/commute/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_point: body.from_point,
      to_point: body.to_point,
      free_text: body.free_text ?? '',
      notes: body.notes ?? '',
      use_directions: body.use_directions ?? true,
    }),
  });
  if (!res.ok) {
    let detail = '通勤查询失败';
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      /* ignore */
    }
    throw new CommuteApiError(detail, res.status);
  }
  return (await res.json()) as CommuteLookupResponse;
}
