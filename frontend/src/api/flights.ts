import type {
  FlightSearchRequest,
  FlightSearchResponse,
  FlightVerifyFromTextRequest,
  FlightVerifyFromTextResponse,
} from '../types/flight';

const SEARCH_TIMEOUT_MS = 130_000;
const VERIFY_TIMEOUT_MS = 330_000;

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

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

export async function searchFlights(
  body: FlightSearchRequest,
): Promise<FlightSearchResponse> {
  const res = await fetch(`${apiBase()}/api/v1/flights/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: timeoutSignal(SEARCH_TIMEOUT_MS),
    body: JSON.stringify({
      ...body,
      include_letsfg: body.include_letsfg ?? false,
      include_ignav: body.include_ignav ?? true,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as FlightSearchResponse;
}

export interface FlightManualValidateRequest {
  origin: string;
  destination: string;
  depart_at: string;
  arrive_at: string;
  trip_destination?: string | null;
  trip_date_start?: string | null;
  trip_date_end?: string | null;
}

export interface FlightManualValidateResponse {
  ok: boolean;
  origin_iata?: string | null;
  dest_iata?: string | null;
  duration_minutes?: number | null;
  errors: string[];
  warnings: string[];
}

export async function validateManualFlight(
  body: FlightManualValidateRequest,
): Promise<FlightManualValidateResponse> {
  const res = await fetch(`${apiBase()}/api/v1/flights/manual-validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: timeoutSignal(15_000),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as FlightManualValidateResponse;
}

export type AirportMatchType = 'iata' | 'city' | 'alias' | 'name' | 'country';

export interface AirportSearchHit {
  iata: string;
  name: string;
  city: string;
  country: string;
  name_zh?: string;
  city_zh?: string;
  country_zh?: string;
  label: string;
  match_type: AirportMatchType;
  score: number;
}

export interface AirportSearchResponse {
  query: string;
  results: AirportSearchHit[];
}

export async function searchAirports(
  q: string,
  limit = 12,
): Promise<AirportSearchResponse> {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });
  const res = await fetch(`${apiBase()}/api/v1/flights/airports?${params}`, {
    method: 'GET',
    signal: timeoutSignal(8_000),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as AirportSearchResponse;
}

export async function verifyFlightFromText(
  body: FlightVerifyFromTextRequest,
): Promise<FlightVerifyFromTextResponse> {
  const res = await fetch(`${apiBase()}/api/v1/flights/verify-from-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: timeoutSignal(VERIFY_TIMEOUT_MS),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as FlightVerifyFromTextResponse;
}
