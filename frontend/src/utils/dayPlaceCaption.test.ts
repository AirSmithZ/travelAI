import { dayPlaceCaption } from './dayPlaceCaption';
import type { DayPlan, ItineraryNode } from '../types/itinerary';
import type { TripRequest } from '../types/tripRequest';
import type { ConfirmedHotelStay } from '../types/travelIntel';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function trip(partial: Partial<TripRequest>): TripRequest {
  return {
    free_text: '',
    destination: '',
    preference_tags: [],
    ...partial,
  };
}

function day(partial: Partial<DayPlan> & Pick<DayPlan, 'date'>): DayPlan {
  return {
    day_index: 1,
    weekday: '周四',
    label: '第 1 天',
    nodes: [],
    edges: [],
    ...partial,
  };
}

function sight(name: string, minutes = 0, optional = false): ItineraryNode {
  return {
    id: name,
    name,
    category: 'attraction',
    lat: 0,
    lng: 0,
    is_optional: optional,
    duration_minutes: minutes,
  };
}

{
  const caption = dayPlaceCaption(
    day({ date: '2026-10-02', label: '第 2 天 · 滨城步行' }),
    trip({
      destination: '越南',
      segments: [
        { id: 'seg_1', city: '胡志明市', date_start: '2026-10-01', date_end: '2026-10-04' },
      ],
    }),
  );
  assert(caption.country === '越南' && caption.city === '胡志明市', 'hcmc country and city');
  assert(caption.placeLine === '越南 · 胡志明市', 'hcmc place line');
  assert(caption.highlight === '滨城步行', 'label theme is the highlight');
}

{
  const caption = dayPlaceCaption(
    day({ date: '2027-02-12', region: '市区' }),
    trip({
      destination: '澳大利亚和新西兰',
      segments: [
        { id: 'seg_1', city: '墨尔本', date_start: '2027-02-10', date_end: '2027-02-16' },
      ],
    }),
  );
  assert(caption.country === '澳大利亚' && caption.city === '墨尔本', 'melbourne despite two countries');
  assert(caption.highlight === '', 'generic label has no theme');
}

{
  const caption = dayPlaceCaption(
    day({
      date: '2027-02-10',
      region: '市中心',
      label: '第 1 天',
      nodes: [sight('十二门徒', 40), sight('大洋路', 180)],
    }),
    trip({ destination: '澳洲', date_start: '2027-02-10', date_end: '2027-02-12' }),
  );
  assert(caption.country === '澳大利亚', '澳洲 canonicalizes');
  assert(caption.city === '', 'district is not a city');
  assert(caption.highlight === '大洋路', 'longest sight is the highlight');
}

{
  const caption = dayPlaceCaption(
    day({ date: '2027-02-11', region: '墨尔本', label: '第 2 天 · 墨尔本' }),
    trip({ destination: '澳大利亚' }),
  );
  assert(caption.city === '墨尔本' && caption.country === '澳大利亚', 'city from day region');
  assert(caption.highlight === '', 'highlight dropped when it repeats the city');
}

{
  const caption = dayPlaceCaption(
    day({ date: '2026-03-01', label: '第 1 天' }),
    trip({ destination: '新加坡', date_start: '2026-03-01', date_end: '2026-03-03' }),
  );
  assert(caption.placeLine === '新加坡' && caption.city === '', 'city-state shown once');
}

{
  const hotels: ConfirmedHotelStay[] = [
    {
      id: 'h2',
      sequence: 2,
      city: '皇后镇',
      name: '湖边',
      check_in: '2027-02-20',
      check_out: '2027-02-23',
      is_primary: true,
      is_anchor: true,
      booking_status: 'selected',
      segment_id: 'seg_2',
    },
  ];
  const caption = dayPlaceCaption(
    day({ date: '2027-02-21', label: '第 4 天' }),
    trip({
      destination: '新西兰',
      segments: [
        { id: 'seg_1', city: '奥克兰', date_start: '2027-02-18', date_end: '2027-02-20' },
        { id: 'seg_2', city: '皇后镇', date_start: '2027-02-20', date_end: '2027-02-24' },
      ],
    }),
    hotels,
  );
  assert(caption.country === '新西兰' && caption.city === '皇后镇', 'hotel night wins the city');
}

{
  const caption = dayPlaceCaption(
    day({
      date: '2027-02-09',
      label: '第 1 天',
      nodes: [
        {
          id: 'air',
          name: '墨尔本机场',
          category: 'airport',
          lat: 0,
          lng: 0,
          is_optional: false,
        },
        {
          id: 'stay',
          name: '市区酒店',
          category: 'hotel',
          lat: 0,
          lng: 0,
          is_optional: false,
        },
      ],
    }),
    trip({
      destination: '澳大利亚',
      segments: [{ id: 'seg_1', city: '墨尔本', date_start: '2027-02-09', date_end: '2027-02-12' }],
    }),
  );
  assert(caption.highlight === '抵达', 'arrival day without a theme');
}

{
  const caption = dayPlaceCaption(
    day({
      date: '2027-02-11',
      region: '墨尔本',
      label: '十二使徒团，约 12 小时，当晚回城',
    }),
    trip({
      destination: '澳大利亚、新西兰',
      date_start: '2027-02-09',
      date_end: '2027-03-01',
    }),
  );
  assert(caption.country === '澳大利亚' && caption.city === '墨尔本', 'region city beats multi-country destination');
  assert(caption.highlight === '十二使徒团', 'long day note shortens to the first phrase');
  assert(caption.detail.includes('当晚回城'), 'hover keeps the full note');
}

{
  const caption = dayPlaceCaption(
    day({ date: '2027-02-22', region: '费尔利', label: '6:50 落地。自驾进镇' }),
    trip({ destination: '澳大利亚、新西兰' }),
  );
  assert(caption.country === '新西兰' && caption.city === '费尔利', 'fairlie is new zealand');
  assert(caption.highlight === '自驾进镇', 'a one-word arrival line yields to the next sentence');
}

console.log('dayPlaceCaption.test.ts OK');
