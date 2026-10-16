import type { Itinerary } from '../types/itinerary';
import type { TravelPlan } from '../types/travelPlan';
import type { ConfirmedFlightLeg, ConfirmedHotelStay } from '../types/travelIntel';
import { createEmptyTravelIntel } from '../types/travelIntel';
import { DEFAULT_FORM_LAYOUT } from '../utils/formLayout';
import { ensureItineraryNodeRegions } from '../utils/nodeRegion';
import anzTrip from './anzTrip.json';

export const ANZ_PLAN_ID = 'plan-anz-2027';

const trip = anzTrip as {
  itinerary: Itinerary;
  hotels: ConfirmedHotelStay[];
  flights: ConfirmedFlightLeg[];
};

/** 澳新行程整理录入的计划。机票是选定报价，不是已付款订单。酒店写在每天的节点上。 */
export function createAnzPlan(): TravelPlan {
  const itinerary = ensureItineraryNodeRegions(trip.itinerary);
  return {
    id: ANZ_PLAN_ID,
    title: '澳新行程',
    created_at: '2026-10-14T06:20:00.000Z',
    updated_at: '2026-10-15T03:50:00.000Z',
    phase: 'detailed',
    trip_request: {
      free_text:
        '2027-02-09 至 2027-03-01，4 个成人。成都出发，经墨尔本、霍巴特、悉尼、凯恩斯，再进新西兰基督城、费尔利、瓦纳卡、皇后镇。按 2026-10-15 的行程整理录入。自驾途径点在 2 月 23 日至 26 日。2 月 27 日市区，2 月 28 日米尔福德并还车。',
      departure: '成都',
      destination: '澳大利亚、新西兰',
      date_start: '2027-02-09',
      date_end: '2027-03-01',
      day_count: 21,
      travelers: 4,
      hotel_rooms: 2,
      preference_tags: [],
      notes:
        '人均合计 33596.178125 元，4 人 134384.7125 元。报团按 2026-10-15 飞猪成人价。地面交通另计人均 133.49 澳元，不和人民币相加。奥兰季两晚、阿尔卑斯交会镇一晚、松木 3 晚还没按新日期报价。2 月 28 日去 Apex 还车是自己开车，不打车。3 月 1 日去机场的车费没有。回程 4059 元是 3 月 3 日那一页，3 月 1 日没有重查。',
      planning_strategy: 'flight_hotel_first',
    },
    travel_intel: {
      ...createEmptyTravelIntel(),
      status: 'partial',
      flights: trip.flights,
      hotels: [],
    },
    itinerary,
    chat_messages: [],
    pending_patches: [],
    form_layout: DEFAULT_FORM_LAYOUT,
    evidence_link_modules: [],
  };
}
