import { searchFlights } from '../../api/flights';
import type { ChatToolCall } from '../../api/chat';
import { usePlanStore } from '../../stores/usePlanStore';
import type { RankPreference } from '../../types/flight';
import {
  createFlightSearchActivity,
  formatActivitySummary,
  patchActivityStep,
} from '../../types/chatActivity';

const PREF = new Set<RankPreference>(['cheap', 'fast', 'balanced']);

/**
 * B-FLT-01: execute search_flights from Chat parse → Ignav via /flights/search.
 * Does not invent fares; writes last_flight_search and switches left panel to flight.
 * UX-CHAT-06: writes flight_search Activity into the chat timeline.
 */
export async function executeChatToolCalls(
  toolCalls: ChatToolCall[] | undefined,
): Promise<{ searched: boolean; found: number; error?: string }> {
  const flightCall = toolCalls?.find((t) => t.name === 'search_flights');
  if (!flightCall) return { searched: false, found: 0 };

  const { origin, destination, date } = flightCall.args;
  const returnDate = flightCall.args.return_date?.trim() || undefined;
  const adults = Math.max(1, Math.min(9, Number(flightCall.args.adults) || 1));
  const preference = PREF.has(flightCall.args.preference as RankPreference)
    ? (flightCall.args.preference as RankPreference)
    : 'balanced';

  const store = usePlanStore.getState();
  store.setLeftPanelMode('flight');

  const route = `${origin}→${destination}${returnDate ? `（往返）` : ''}`;
  const activity = createFlightSearchActivity(route);
  store.setChatActivity(activity);

  const requestKey = `${origin}-${destination}-${date}${returnDate ? `-rt-${returnDate}` : ''}`;
  try {
    const res = await searchFlights({
      origin,
      destination,
      date,
      return_date: returnDate,
      adults,
      preference,
      include_ignav: true,
      include_letsfg: false,
    });
    const ranked = res.ranked ?? [];
    const done = patchActivityStep(usePlanStore.getState().chatActivity ?? activity, 'search', {
      status: ranked.length > 0 ? 'done' : 'error',
      detail: ranked.length > 0 ? `${ranked.length} 条报价` : '无结果',
    });
    const summary = formatActivitySummary(done, Date.now() - activity.startedAt);
    store.addChatMessage('assistant', summary);
    store.setChatActivity(null);

    if (ranked.length > 0) {
      store.setFlightSearchResult({
        request_key: requestKey,
        fetched_at: res.fetched_at,
        ranked,
        purchase_url: res.purchase.url,
        warnings: [
          ...(res.warnings ?? []),
          '来源：Ignav（Chat Tool search_flights）',
        ],
        is_round_trip: Boolean(returnDate),
        confirmed_quote_id: null,
        hide_ranked: false,
      });
      return { searched: true, found: ranked.length };
    }
    const prev = store.getActivePlan().travel_intel.last_flight_search;
    if (prev) {
      store.mergeFlightSearchResult({
        warnings: res.warnings?.length ? res.warnings : prev.warnings,
        purchase_url: res.purchase.url || prev.purchase_url,
      });
    }
    return {
      searched: true,
      found: 0,
      error: res.errors?.ignav ?? '未找到航班报价',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '航班搜索失败';
    const failed = {
      ...patchActivityStep(usePlanStore.getState().chatActivity ?? activity, 'search', {
        status: 'error' as const,
        detail: msg,
      }),
      error: msg,
    };
    store.addChatMessage('assistant', formatActivitySummary(failed, Date.now() - activity.startedAt));
    store.setChatActivity(null);
    return {
      searched: true,
      found: 0,
      error: msg,
    };
  }
}
