/**
 * B-FLT-03: parse Trip.com showfarefirst (or similar) search URLs.
 * Only OD + dates — never flight numbers (Trip URL has none).
 */
export interface ParsedTripcomSearch {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
}

function pickParam(params: URLSearchParams, keys: string[]): string | null {
  for (const k of keys) {
    const v = params.get(k) ?? params.get(k.toLowerCase()) ?? params.get(k.toUpperCase());
    if (v?.trim()) return v.trim();
  }
  return null;
}

export function parseTripcomSearchUrl(url: string): ParsedTripcomSearch | null {
  const raw = url.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();
  if (!host.includes('trip.com') && !host.includes('ctrip.com')) {
    return null;
  }

  const params = u.searchParams;
  const dcity = pickParam(params, ['dcity', 'dCity', 'fromCity', 'from']);
  const acity = pickParam(params, ['acity', 'aCity', 'toCity', 'to']);
  const ddate = pickParam(params, ['ddate', 'dDate', 'departDate', 'date']);
  const rdate = pickParam(params, ['rdate', 'rDate', 'returnDate']);

  if (!dcity || !acity || !ddate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ddate)) return null;
  if (rdate && !/^\d{4}-\d{2}-\d{2}$/.test(rdate)) {
    return {
      origin: dcity.toUpperCase(),
      destination: acity.toUpperCase(),
      departDate: ddate,
    };
  }

  return {
    origin: dcity.toUpperCase(),
    destination: acity.toUpperCase(),
    departDate: ddate,
    ...(rdate ? { returnDate: rdate } : {}),
  };
}
