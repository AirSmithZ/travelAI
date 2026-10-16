import { buildNotesBoard, groupNotesBoard } from './notesBoard';
import { validateClimateHints, validateVisitWindows } from './climateHints';
import { createEmptyTripRequest } from '../types/tripRequest';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

{
  const items = buildNotesBoard({
    destination: '新加坡',
    free_text: '记得带充电宝，注意签证有效期',
  });
  assert(items.some((i) => i.source === 'user'), 'user lines');
  assert(items.some((i) => i.source === 'kb' && i.category === 'customs'), 'sg kb');
  assert(groupNotesBoard(items).length >= 1, 'grouped');
}

{
  const tr = {
    ...createEmptyTripRequest(),
    destination: '越南',
    segments: [
      { id: 'seg_1', city: '胡志明市', date_start: '2026-10-01', date_end: '2026-10-04' },
      { id: 'seg_2', city: '芽庄', date_start: '2026-10-04', date_end: '2026-10-08' },
    ],
  };
  const climate = validateClimateHints(tr);
  assert(
    climate.some((i) => i.code === 'climate_season' && i.message.includes('芽庄')),
    'climate warn for 芽庄 Oct',
  );
  assert(climate.every((i) => i.severity === 'warn'), 'climate never hard');
}

{
  const tr = {
    ...createEmptyTripRequest(),
    destination: '日本',
    segments: [
      { id: 'seg_1', city: '京都', date_start: '2026-04-20', date_end: '2026-04-25' },
    ],
    must_see: [
      { name: '樱花', city: '京都', window_start: '2026-03-20', window_end: '2026-04-05' },
    ],
  };
  const win = validateVisitWindows(tr);
  assert(win.some((i) => i.code === 'visit_window'), 'visit window miss');
}

console.log('notesBoard+climateHints OK');
