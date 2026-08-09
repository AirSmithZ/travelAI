import assert from 'node:assert/strict';
import { patchesFromSearchFlightsTool } from './flightToolTripSync';
import { createEmptyTripRequest } from '../types/tripRequest';

const empty = createEmptyTripRequest();

{
  const patches = patchesFromSearchFlightsTool(
    [
      {
        name: 'search_flights',
        args: {
          origin: '上海',
          destination: '新加坡',
          date: '2026-08-30',
          return_date: '2026-09-02',
          adults: 2,
          preference: 'balanced',
        },
      },
    ],
    empty,
  );
  const byField = Object.fromEntries(patches.map((p) => [p.field_path, p.new_value]));
  assert.equal(byField.departure, '上海');
  assert.equal(byField.destination, '新加坡');
  assert.equal(byField.date_start, '2026-08-30');
  assert.equal(byField.date_end, '2026-09-02');
  assert.equal(byField.travelers, 2);
}

{
  const patches = patchesFromSearchFlightsTool(
    [
      {
        name: 'search_flights',
        args: {
          origin: '上海',
          destination: '新加坡',
          date: '2026-08-30',
          adults: 2,
          preference: 'balanced',
        },
      },
    ],
    { ...empty, destination: '新加坡' },
    ['destination'],
  );
  assert.ok(!patches.some((p) => p.field_path === 'destination'));
  assert.ok(patches.some((p) => p.field_path === 'departure'));
}

{
  const patches = patchesFromSearchFlightsTool(undefined, empty);
  assert.equal(patches.length, 0);
}

console.log('flightToolTripSync.test.ts ok');
