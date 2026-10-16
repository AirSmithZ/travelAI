/**
 * HOT-ZONE-CATALOG knife2: lightweight stay-zone observation ring.
 * No third-party analytics — DEV console + in-memory ring for debug / later export.
 */

export type StayZoneObserveEvent =
  | { type: 'catalog_load'; city: string; count: number }
  | {
      type: 'lodging_search';
      zoneId: string;
      city?: string;
      catalog?: boolean;
      outcome: 'cache_hit' | 'empty_cooldown' | 'ok' | 'empty' | 'trip_first' | 'error';
      count?: number;
    };

type RingItem = { t: number; e: StayZoneObserveEvent };

const RING_MAX = 48;
let ring: RingItem[] = [];

function isDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

export function observeStayZone(e: StayZoneObserveEvent): void {
  ring = [...ring.slice(-(RING_MAX - 1)), { t: Date.now(), e }];
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.info('[stay-zone]', e.type, e);
  }
}

/** Test / debug helper */
export function getStayZoneObserveRing(): readonly RingItem[] {
  return ring;
}

export function clearStayZoneObserveRing(): void {
  ring = [];
}
