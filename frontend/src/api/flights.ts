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
