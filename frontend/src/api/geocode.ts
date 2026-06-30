export interface GeocodeResult {
  lat: number;
  lng: number;
  address: string;
  coord_confidence: string;
  coord_source: string;
}

export interface GeocodeCandidate {
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string;
  coord_source: string;
}

export interface GeocodeAutocompleteResponse {
  results: GeocodeCandidate[];
  provider?: string | null;
  warnings?: string[];
}

export class GeocodeApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeocodeApiError';
    this.status = status;
  }
}

const apiBase = () => import.meta.env.VITE_API_BASE ?? '';

export async function geocodeSearch(query: string, destination: string): Promise<GeocodeResult> {
  const res = await fetch(`${apiBase()}/api/v1/geocode/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, destination }),
  });
  if (!res.ok) {
    let detail = '地理编码失败';
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new GeocodeApiError(detail, res.status);
  }
  return res.json() as Promise<GeocodeResult>;
}

export async function geocodeAutocomplete(
  query: string,
  destination: string,
  limit = 5,
): Promise<GeocodeAutocompleteResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (destination.trim()) params.set('city', destination.trim());
  const res = await fetch(`${apiBase()}/api/v1/geocode/autocomplete?${params}`);
  if (!res.ok) {
    let detail = '地点联想失败';
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new GeocodeApiError(detail, res.status);
  }
  const data = (await res.json()) as GeocodeAutocompleteResponse;
  return {
    results: data.results ?? [],
    provider: data.provider ?? null,
    warnings: data.warnings ?? [],
  };
}

export interface GeocodeReverseResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  coord_source: string;
}

export async function geocodeReverse(lat: number, lng: number): Promise<GeocodeReverseResult | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });
  const res = await fetch(`${apiBase()}/api/v1/geocode/reverse?${params}`);
  if (!res.ok) return null;
  return res.json() as Promise<GeocodeReverseResult>;
}
