import type { ChatToolCall } from '../api/chat';
import { formatAirportLabel } from '../data/airportLabels';
import type { FormPatch } from '../types/travelPlan';
import type { TripRequest } from '../types/tripRequest';
import { createTripRequestPatch } from './patchSchema';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function placeForTrip(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  if (/^[A-Za-z]{3}$/.test(raw)) {
    return formatAirportLabel(raw.toUpperCase());
  }
  return raw;
}

/**
 * P89: when Chat emits search_flights, derive trip_request patches so
 * plan summary / flight panel stay in sync (LLM often omits patches).
 */
export function patchesFromSearchFlightsTool(
  toolCalls: ChatToolCall[] | undefined,
  tripRequest: TripRequest,
  alreadyCoveredFields?: Iterable<string>,
): FormPatch[] {
  const flight = toolCalls?.find((t) => t.name === 'search_flights');
  if (!flight) return [];

  const covered = new Set(alreadyCoveredFields ?? []);
  const args = flight.args;
  const out: FormPatch[] = [];

  const addSet = (field: keyof TripRequest, value: string | number, summary: string) => {
    if (covered.has(field)) return;
    if (value === '' || value == null) return;
    if (tripRequest[field] === value) return;
    out.push(
      createTripRequestPatch('set', field, value, summary, { confidence: 'high' }),
    );
    covered.add(field);
  };

  const origin = placeForTrip(String(args.origin ?? ''));
  const destination = placeForTrip(String(args.destination ?? ''));
  const date = String(args.date ?? '').trim().slice(0, 10);
  const returnDate = args.return_date?.trim().slice(0, 10) || '';
  const adults = Math.max(1, Math.min(9, Number(args.adults) || 1));

  if (origin) addSet('departure', origin, `出发地：${origin}`);
  if (destination) addSet('destination', destination, `目的地：${destination}`);
  if (date && DATE_RE.test(date)) addSet('date_start', date, `出发日期：${date}`);
  if (returnDate && DATE_RE.test(returnDate)) {
    addSet('date_end', returnDate, `返程日期：${returnDate}`);
  }
  addSet('travelers', adults, `人数：${adults}`);

  return out;
}
