import type { ConfirmedFlightLeg } from '../types/travelIntel';
import { resolveAirportPlace } from './resolveAirportPlace';

/** Outbound (or first) dest IATA from confirmed flights. */
export function outboundDestIata(
  flights: ConfirmedFlightLeg[] | undefined | null,
): string {
  if (!flights?.length) return '';
  const ordered = [...flights].sort((a, b) => {
    const roleRank = (r: string | undefined) => (r === 'outbound' ? 0 : 1);
    return roleRank(a.role) - roleRank(b.role) || (a.sequence ?? 0) - (b.sequence ?? 0);
  });
  for (const f of ordered) {
    const iata = (f.dest_iata || '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(iata)) return iata;
  }
  return '';
}

/**
 * P117/P118: geocode bias city from confirmed outbound arrival via /flights/airports
 * (no hard-coded IATA→城市表).
 */
export async function cityLabelFromOutboundFlight(
  flights: ConfirmedFlightLeg[] | undefined | null,
): Promise<string> {
  const iata = outboundDestIata(flights);
  if (!iata) return '';
  const resolved = await resolveAirportPlace(iata);
  return (resolved?.cityLabel || iata).trim();
}
