import { useEffect, useMemo, useState } from 'react';
import { searchFlights } from '../../api/flights';
import type { FlightSearchResponse } from '../../types/flight';
import {
  FLIGHT_CACHE_TTL_MS,
  cacheGet,
  cacheInvalidate,
  cacheSet,
  flightCacheKey,
} from '../../utils/searchResultCache';
import { usePlanStore } from '../../stores/usePlanStore';
import type { FlightLegRole, ConfirmedFlightLeg } from '../../types/travelIntel';
import {
  formatFlightLegSummary,
  flightIntelPanelBadgeLabel,
  flightRoleLabel,
  getFlightIntelPanelPhase,
  sortFlightsBySequence,
  suggestNextFlightLeg,
} from '../../types/travelIntel';
import type { FlightQuote, RankPreference } from '../../types/flight';
import {
  formatDuration,
  formatLegRoute,
  formatPreference,
  formatPrice,
  formatStopsLabel,
  formatTimeShort,
  isRoundTripQuote,
  totalTripDuration,
} from '../../types/flight';
import { todayLocalDate } from '../../utils/dateUtils';
import {
  FormDateInput,
  FormField,
  FormNumberInput,
  FormRow,
  FormSelect,
} from '../ui/FormField';
import './FlightIntelPanel.css';
import { AirportCombobox } from './AirportCombobox';
import { FlightManualAddPanel } from './FlightManualAddPanel';

const ROLES: { id: FlightLegRole; label: string }[] = [
  { id: 'outbound', label: '去程' },
  { id: 'return', label: '回程' },
  { id: 'intercity', label: '城际' },
];

/** Prefer usable travel dates: bump past dates to today; keep return ≥ depart. */
function normalizeTripDates(
  start?: string | null,
  end?: string | null,
): { date_start?: string; date_end?: string; healed: boolean } {
  const today = todayLocalDate();
  let date_start = (start ?? '').trim();
  let date_end = (end ?? '').trim();
  let healed = false;
  if (date_start && date_start < today) {
    date_start = today;
    healed = true;
  }
  if (date_end && date_end < today) {
    date_end = date_start || today;
    healed = true;
  }
  if (date_start && date_end && date_end < date_start) {
    date_end = date_start;
    healed = true;
  }
  return {
    date_start: date_start || undefined,
    date_end: date_end || undefined,
    healed,
  };
}

function LegMetaRow({
  label,
  leg,
}: {
  label: string;
  leg: {
    route_label: string;
    origin_iata: string;
    dest_iata: string;
    depart_time: string;
    arrive_time: string;
    duration_minutes: number;
    stops: number;
    flight_numbers?: string[];
  };
}) {
  const flights =
    leg.flight_numbers?.length ? ` · ${leg.flight_numbers.join('/')}` : '';
  return (
    <div className="flight-intel__leg-row">
      <span className="flight-intel__leg-tag">{label}</span>
      <span className="flight-intel__leg-route">{formatLegRoute(leg)}</span>
      <span className="flight-intel__leg-time">
        {formatTimeShort(leg.depart_time)} → {formatTimeShort(leg.arrive_time)}
      </span>
      <span className="flight-intel__offer-sep">·</span>
      <span>{formatDuration(leg.duration_minutes)}</span>
      <span className="flight-intel__offer-sep">·</span>
      <span>{formatStopsLabel(leg.stops)}</span>
      {flights && <span className="flight-intel__leg-flights">{flights}</span>}
    </div>
  );
}

function OfferCard({
  offer,
  isRoundTripSearch,
  onConfirm,
}: {
  offer: FlightQuote;
  isRoundTripSearch: boolean;
  onConfirm: () => void;
}) {
  const roundTrip = isRoundTripQuote(offer);

  return (
    <article key={offer.id} className="flight-intel__offer">
      <div className="flight-intel__offer-top">
        <span className="flight-intel__offer-rank">#{offer.rank ?? '—'}</span>
        <span className="flight-intel__offer-airline">
          {roundTrip ? '往返组合' : offer.airline}
        </span>
        <div className="flight-intel__offer-price-wrap">
          <span className="flight-intel__offer-price">{formatPrice(offer)}</span>
          <span className="flight-intel__offer-price-note">参考价，以 OTA 为准</span>
        </div>
      </div>

      {offer.rank_reason && (
        <p className="flight-intel__offer-reason">{offer.rank_reason}</p>
      )}

      {roundTrip && offer.return_leg ? (
        <div className="flight-intel__legs">
          <LegMetaRow label="去程" leg={offer} />
          <LegMetaRow label="回程" leg={offer.return_leg} />
          <p className="flight-intel__offer-total">
            合计飞行 {formatDuration(totalTripDuration(offer))}
          </p>
        </div>
      ) : (
        <div className="flight-intel__offer-meta">
          <span className="flight-intel__leg-route">{formatLegRoute(offer)}</span>
          <span className="flight-intel__offer-sep">·</span>
          <span className="flight-intel__offer-time">
            {formatTimeShort(offer.depart_time)} → {formatTimeShort(offer.arrive_time)}
          </span>
          <span className="flight-intel__offer-sep">·</span>
          <span>{formatDuration(offer.duration_minutes)}</span>
          <span className="flight-intel__offer-sep">·</span>
          <span>{formatStopsLabel(offer.stops)}</span>
          {offer.flight_numbers?.length ? (
            <>
              <span className="flight-intel__offer-sep">·</span>
              <span>{offer.flight_numbers.join('/')}</span>
            </>
          ) : null}
        </div>
      )}

      <div className="flight-intel__offer-foot">
        <button
          type="button"
          className="form-btn form-btn--sm form-btn--primary"
          onClick={onConfirm}
        >
          {roundTrip || isRoundTripSearch ? '确认往返' : '确认选用'}
        </button>
      </div>
    </article>
  );
}

function ConfirmedLegBlock({
  role,
  sequence,
  quote,
}: {
  role: 'outbound' | 'return' | 'intercity';
  sequence: number;
  quote: FlightQuote | ConfirmedFlightLeg['quote'];
}) {
  const roleLabel =
    role === 'outbound' ? '去程' : role === 'return' ? '回程' : '城际';
  const flights = quote.flight_numbers?.length
    ? quote.flight_numbers.join('/')
    : '';

  return (
    <div className={`flight-intel__cleg flight-intel__cleg--${role}`}>
      <div className="flight-intel__cleg-rail" aria-hidden>
        <span className="flight-intel__cleg-dot" />
      </div>
      <div className="flight-intel__cleg-body">
        <div className="flight-intel__cleg-top">
          <span className="flight-intel__cleg-role">
            {sequence}. {roleLabel}
          </span>
          <span className="flight-intel__cleg-times">
            {formatTimeShort(quote.depart_time)}
            <span className="flight-intel__cleg-arrow" aria-hidden>
              –
            </span>
            {formatTimeShort(quote.arrive_time)}
          </span>
        </div>
        <p className="flight-intel__cleg-route">{formatLegRoute(quote)}</p>
        <p className="flight-intel__cleg-meta">
          <span>{formatDuration(quote.duration_minutes)}</span>
          <span className="flight-intel__offer-sep">·</span>
          <span>{formatStopsLabel(quote.stops)}</span>
          {flights ? (
            <>
              <span className="flight-intel__offer-sep">·</span>
              <span className="flight-intel__cleg-flights">{flights}</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function ConfirmedFlightsSummary({
  flights,
  purchaseUrl,
  onContinue,
  onAddNextLeg,
}: {
  flights: ConfirmedFlightLeg[];
  purchaseUrl?: string;
  onContinue: () => void;
  onAddNextLeg: () => void;
}) {
  const sorted = sortFlightsBySequence(flights);
  const outbound = sorted.find((f) => f.role === 'outbound');
  const inbound = sorted.find((f) => f.role === 'return');
  const isRoundTrip = Boolean(outbound && inbound && outbound.bundle_id === inbound.bundle_id);
  const priceLeg = sorted.find((f) => f.quote.price_amount > 0) ?? sorted[0];
  const hasIntercity = sorted.some((f) => f.role === 'intercity');
  const showRoundTrip = isRoundTrip && outbound && inbound && !hasIntercity;
  const title = showRoundTrip ? '已选往返组合' : `已确认 ${sorted.length} 段航班`;
  const showPrice = Boolean(priceLeg && priceLeg.quote.price_amount > 0);

  return (
    <section className="flight-intel__confirmed" aria-label={title}>
      <header className="flight-intel__confirmed-head">
        <div className="flight-intel__confirmed-head-text">
          <p className="flight-intel__confirmed-eyebrow">航程</p>
          <h4 className="flight-intel__confirmed-title">{title}</h4>
        </div>
        {showPrice && priceLeg && (
          <div className="flight-intel__confirmed-price-block">
            <p className="flight-intel__confirmed-price">
              <span className="flight-intel__confirmed-currency">
                {priceLeg.quote.price_currency}
              </span>
              <span className="flight-intel__confirmed-amount">
                {priceLeg.quote.price_amount.toLocaleString()}
              </span>
            </p>
            <p className="flight-intel__confirmed-price-note">
              {priceLeg.quote.trip_type === 'round_trip' ? '往返参考价' : '参考价'}
            </p>
          </div>
        )}
      </header>

      {showRoundTrip && outbound && inbound ? (
        <div className="flight-intel__confirmed-timeline">
          <ConfirmedLegBlock
            role="outbound"
            sequence={outbound.sequence}
            quote={outbound.quote}
          />
          <ConfirmedLegBlock
            role="return"
            sequence={inbound.sequence}
            quote={inbound.quote}
          />
        </div>
      ) : (
        <ul className="flight-intel__confirmed-legs">
          {sorted.map((leg) => (
            <li key={leg.id}>
              <ConfirmedLegBlock
                role={leg.role}
                sequence={leg.sequence}
                quote={leg.quote}
              />
            </li>
          ))}
        </ul>
      )}

      <footer className="flight-intel__confirmed-actions">
        <div className="flight-intel__confirmed-actions-secondary">
          {purchaseUrl && (
            <a
              href={purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flight-intel__confirmed-book"
            >
              Trip.com 预订
              <span aria-hidden> →</span>
            </a>
          )}
          <button
            type="button"
            className="flight-intel__confirmed-ghost"
            onClick={onAddNextLeg}
          >
            添加下一段
          </button>
        </div>
        <button
          type="button"
          className="flight-intel__confirmed-cta"
          onClick={onContinue}
        >
          继续 · 住宿片区
        </button>
      </footer>
    </section>
  );
}

export function FlightIntelPanel({ layout = 'embedded' }: { layout?: 'embedded' | 'full' }) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const confirmFlightQuote = usePlanStore((s) => s.confirmFlightQuote);
  const removeFlightLeg = usePlanStore((s) => s.removeFlightLeg);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const mergeFlightSearchResult = usePlanStore((s) => s.mergeFlightSearchResult);
  const updateTripRequest = usePlanStore((s) => s.updateTripRequest);

  const tr = plan.trip_request;
  const intel = plan.travel_intel;
  const sortedFlights = useMemo(
    () => sortFlightsBySequence(intel.flights),
    [intel.flights],
  );

  const [origin, setOrigin] = useState(tr.departure ?? '');
  const [destination, setDestination] = useState(tr.destination ?? '');
  const [date, setDate] = useState(() => normalizeTripDates(tr.date_start, tr.date_end).date_start ?? '');
  const [returnDate, setReturnDate] = useState(
    () => normalizeTripDates(tr.date_start, tr.date_end).date_end ?? '',
  );
  const [adults, setAdults] = useState(tr.travelers ?? 1);
  const [preference, setPreference] = useState<RankPreference>('balanced');
  const [role, setRole] = useState<FlightLegRole>('outbound');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateHint, setTemplateHint] = useState<string | null>(null);
  const [cacheHint, setCacheHint] = useState<string | null>(null);

  // trip_request → 本地搜票字段；过期日期就地纠偏并写回 store，避免再打 Ignav 旧年日期。
  useEffect(() => {
    setOrigin(tr.departure ?? '');
    setDestination(tr.destination ?? '');
    setAdults(tr.travelers ?? 1);
    const normalized = normalizeTripDates(tr.date_start, tr.date_end);
    setDate(normalized.date_start ?? '');
    setReturnDate(normalized.date_end ?? '');
    if (normalized.healed) {
      updateTripRequest({
        date_start: normalized.date_start,
        date_end: normalized.date_end,
      });
    }
  }, [tr.departure, tr.destination, tr.date_start, tr.date_end, tr.travelers, updateTripRequest]);

  function commitDepartDate(next: string) {
    const today = todayLocalDate();
    const date_start = next && next < today ? today : next;
    let date_end = returnDate.trim();
    if (date_end && date_start && date_end < date_start) date_end = date_start;
    setDate(date_start);
    if (date_end !== returnDate) setReturnDate(date_end);
    updateTripRequest({
      date_start: date_start || undefined,
      date_end: date_end || undefined,
    });
  }

  function commitReturnDate(next: string) {
    const depart = date.trim();
    const date_end = next && depart && next < depart ? depart : next;
    setReturnDate(date_end);
    updateTripRequest({ date_end: date_end || undefined });
  }

  const searchResult = intel.last_flight_search;
  const ranked = searchResult?.ranked ?? [];
  const hideRanked = Boolean(searchResult?.hide_ranked);
  const panelPhase = getFlightIntelPanelPhase(intel);
  const badgeLabel = flightIntelPanelBadgeLabel(panelPhase);
  const showConfirmedCard = intel.flights.length > 0 && hideRanked;
  const showRanked = ranked.length > 0 && !hideRanked;
  const isRoundTripSearch = Boolean(returnDate.trim());

  const canSearch = origin.trim() && destination.trim() && date.trim();

  function applyNextLegSuggestion(opts?: { forceIntercity?: boolean }) {
    let suggestion = suggestNextFlightLeg(intel.flights, tr);

    if (opts?.forceIntercity) {
      if (intel.flights.length === 0) {
        suggestion = {
          role: 'intercity',
          origin: (tr.destination ?? '').trim(),
          destination: '',
          clearReturnDate: true,
          hint: '模板：城际 · 请填写下一段到达',
        };
      } else {
        const last = sortFlightsBySequence(intel.flights).at(-1)!;
        suggestion = {
          role: 'intercity',
          origin: last.dest_iata,
          destination: '',
          clearReturnDate: true,
          hint: `模板：城际 · 自 ${last.dest_iata} 继续`,
        };
      }
    }

    if (suggestion.origin) setOrigin(suggestion.origin);
    setDestination(suggestion.destination);
    setRole(suggestion.role);
    if (suggestion.clearReturnDate) commitReturnDate('');
    setTemplateHint(suggestion.hint);

    if (searchResult?.hide_ranked) {
      mergeFlightSearchResult({ hide_ranked: false, confirmed_quote_id: null });
    }
    setError(null);
    setLeftPanelMode('flight');
  }

  function applyTemplate(kind: 'roundtrip' | 'multicity' | 'intercity') {
    if (kind === 'roundtrip') {
      setOrigin(tr.departure ?? origin);
      setDestination(tr.destination ?? destination);
      const normalized = normalizeTripDates(
        tr.date_start ?? date,
        tr.date_end ?? returnDate,
      );
      commitDepartDate(normalized.date_start ?? '');
      commitReturnDate(normalized.date_end ?? '');
      setRole('outbound');
      setTemplateHint('模板：往返 · 填写返程日一次确认两程');
      if (searchResult?.hide_ranked) {
        mergeFlightSearchResult({ hide_ranked: false, confirmed_quote_id: null });
      }
      return;
    }
    if (kind === 'multicity') {
      if (intel.flights.length === 0) {
        commitReturnDate('');
        setRole('outbound');
        setOrigin(tr.departure ?? '');
        setDestination(tr.destination ?? '');
        setTemplateHint('模板：多城 · 先确认去程，再逐段添加城际');
      } else {
        applyNextLegSuggestion();
        setTemplateHint('模板：多城 · 已预填下一段，确认后继续追加');
      }
      if (searchResult?.hide_ranked) {
        mergeFlightSearchResult({ hide_ranked: false, confirmed_quote_id: null });
      }
      return;
    }
    // intercity (B-P3-02)
    applyNextLegSuggestion({ forceIntercity: true });
  }

  async function handleSearch(opts?: { forceRefresh?: boolean }) {
    if (!canSearch || loading) return;
    const today = todayLocalDate();
    const depart = date.trim();
    const ret = returnDate.trim();
    if (depart < today) {
      setError(`出发日 ${depart} 已过期（今天 ${today}），请改期后再搜。`);
      return;
    }
    if (ret && ret < depart) {
      setError('返程日不能早于出发日。');
      return;
    }
    setLeftPanelMode('flight');
    setLoading(true);
    setError(null);
    setCacheHint(null);
    const requestKey = `${origin}-${destination}-${date}${ret ? `-rt-${ret}` : ''}`;
    const cacheKey = flightCacheKey({
      origin,
      destination,
      date,
      returnDate: ret || undefined,
      adults,
      preference,
    });
    try {
      let res: FlightSearchResponse;
      let fromCache = false;
      const cached = opts?.forceRefresh
        ? null
        : cacheGet<FlightSearchResponse>('flight', cacheKey, FLIGHT_CACHE_TTL_MS);
      // P70: only reuse cache that has ranked quotes (never empty/error shells)
      if (cached && (cached.value.ranked?.length ?? 0) > 0) {
        res = cached.value;
        fromCache = true;
        setCacheHint(
          `缓存命中（${Math.round((Date.now() - cached.fetchedAt) / 1000)}s 前）· 可刷新`,
        );
      } else {
        if (cached) {
          cacheInvalidate('flight', cacheKey);
        }
        res = await searchFlights({
          origin: origin.trim(),
          destination: destination.trim(),
          date: date.trim(),
          return_date: ret || undefined,
          adults,
          preference,
          include_ignav: true,
          include_letsfg: false,
        });
        if ((res.ranked?.length ?? 0) > 0) {
          cacheSet('flight', cacheKey, res);
        }
      }
      const newRanked = res.ranked ?? [];
      if (newRanked.length > 0) {
        usePlanStore.getState().setFlightSearchResult({
          request_key: requestKey,
          fetched_at: res.fetched_at,
          ranked: newRanked,
          purchase_url: res.purchase.url,
          warnings: [
            ...(res.warnings ?? []),
            ...(fromCache ? ['结果来自前端缓存，可点「刷新」重新查价'] : []),
          ],
          is_round_trip: Boolean(ret),
          confirmed_quote_id: null,
          hide_ranked: false,
        });
      } else {
        const prev = usePlanStore.getState().getActivePlan().travel_intel.last_flight_search;
        const purchaseUrl = res.purchase?.url || prev?.purchase_url || '';
        if (prev) {
          usePlanStore.getState().mergeFlightSearchResult({
            warnings: res.warnings?.length ? res.warnings : prev.warnings,
            purchase_url: purchaseUrl || prev.purchase_url,
          });
        } else if (purchaseUrl) {
          usePlanStore.getState().setFlightSearchResult({
            request_key: requestKey,
            fetched_at: res.fetched_at,
            ranked: [],
            purchase_url: purchaseUrl,
            warnings: res.warnings ?? [],
            is_round_trip: Boolean(ret),
            confirmed_quote_id: null,
            hide_ranked: false,
          });
        }
        // P73: distinguish provider/config vs true empty
        const ignavErr = res.errors?.ignav?.trim();
        if (ignavErr && /not configured|api.?key|未配置/i.test(ignavErr)) {
          setError(
            '报价源未配置（IGNAV_API_KEY）。请用下方手动添加航段，或打开 Trip.com 深链查价。',
          );
        } else if (ignavErr) {
          setError(`${ignavErr}。可刷新重试，或手动添加 / 打开 Trip.com。`);
        } else {
          setError('未找到可展示的航班报价。可刷新、手动添加航段，或打开 Trip.com 查价。');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  }

  const latencyHint = useMemo(() => {
    if (!loading) return null;
    return isRoundTripSearch
      ? '往返查询中，通常需 10～40 秒…'
      : 'Ignav 查询中，通常需 5～30 秒…';
  }, [loading, isRoundTripSearch]);

  const searchModeHint = useMemo(() => {
    if (isRoundTripSearch) {
      return `往返搜索 · ${formatPreference(preference)} · 结果含去程+回程组合价`;
    }
    return `单程搜索 · ${formatPreference(preference)} · ${flightRoleLabel(role)} · 填返程日即切换往返`;
  }, [isRoundTripSearch, preference, role]);

  return (
    <section
      className={`flight-intel${layout === 'full' ? ' flight-intel--full' : ''}${panelPhase === 'done' ? ' flight-intel--done' : ''}`}
      aria-label="航班确认"
    >
      <header className="flight-intel__head">
        <div className="flight-intel__head-text">
          <h3 className="flight-intel__title">航班确认</h3>
          <p className="flight-intel__desc">
            支持往返 / 多城 / 城际多段确认；预订请用 Trip.com。
          </p>
        </div>
        <span className={`flight-intel__badge flight-intel__badge--${panelPhase}`}>
          {badgeLabel}
        </span>
      </header>

      {showConfirmedCard && (
        <ConfirmedFlightsSummary
          flights={intel.flights}
          purchaseUrl={searchResult?.purchase_url}
          onContinue={() => setLeftPanelMode('stay')}
          onAddNextLeg={() => applyNextLegSuggestion()}
        />
      )}

      {sortedFlights.length > 0 && (
        <div className="flight-intel__section">
          <p className="flight-intel__label">已确认航段（按顺序）</p>
          <ul className="flight-intel__leg-list">
            {sortedFlights.map((leg) => (
              <li key={leg.id} className="flight-intel__leg">
                <span className="flight-intel__leg-summary">{formatFlightLegSummary(leg)}</span>
                <div className="flight-intel__leg-actions">
                  {leg.purchase_url && (
                    <a
                      href={leg.purchase_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flight-intel__link"
                    >
                      Trip.com
                    </a>
                  )}
                  <button
                    type="button"
                    className="form-btn form-btn--sm form-btn--danger"
                    onClick={() => removeFlightLeg(leg.id)}
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flight-intel__form">
        <div className="flight-intel__templates" role="group" aria-label="航段模板">
          <button
            type="button"
            className="flight-intel__template-chip"
            onClick={() => applyTemplate('roundtrip')}
          >
            往返
          </button>
          <button
            type="button"
            className="flight-intel__template-chip"
            onClick={() => applyTemplate('multicity')}
          >
            多城
          </button>
          <button
            type="button"
            className="flight-intel__template-chip"
            onClick={() => applyTemplate('intercity')}
          >
            城际
          </button>
          {sortedFlights.length > 0 && (
            <button
              type="button"
              className="flight-intel__template-chip flight-intel__template-chip--accent"
              onClick={() => applyNextLegSuggestion()}
            >
              添加下一段
            </button>
          )}
        </div>
        {templateHint && <p className="flight-intel__template-hint">{templateHint}</p>}
        <p className="flight-intel__mode-hint">{searchModeHint}</p>
        {(searchResult?.purchase_url || canSearch) && (
          <div className="flight-intel__trip-cta">
            {searchResult?.purchase_url ? (
              <a
                href={searchResult.purchase_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flight-intel__link flight-intel__link--cta"
              >
                Trip.com 查价与预订 →
              </a>
            ) : (
              <p className="flight-intel__trip-hint">搜索后可打开 Trip.com；订好票请在下方手动添加</p>
            )}
          </div>
        )}
        <FormRow>
          <FormField label="出发">
            <AirportCombobox
              value={origin}
              onChange={setOrigin}
              placeholder="城市 / 国家 / IATA"
            />
          </FormField>
          <FormField label="到达">
            <AirportCombobox
              value={destination}
              onChange={setDestination}
              placeholder="如 马来西亚 / 吉隆坡 / KUL"
            />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="出发日">
            <FormDateInput
              min={todayLocalDate()}
              value={date}
              onChange={commitDepartDate}
              placeholder="出发日期"
            />
          </FormField>
          <FormField label="返程（往返）">
            <FormDateInput
              min={date.trim() || todayLocalDate()}
              value={returnDate}
              onChange={commitReturnDate}
              placeholder="返程（可选）"
              allowClear
            />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="人数">
            <FormNumberInput
              min={1}
              max={9}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value) || 1)}
            />
          </FormField>
          <FormField label="偏好">
            <FormSelect
              value={preference}
              onChange={(e) => setPreference(e.target.value as RankPreference)}
            >
              <option value="balanced">综合</option>
              <option value="cheap">便宜</option>
              <option value="fast">省时</option>
            </FormSelect>
          </FormField>
          {!isRoundTripSearch && (
            <FormField label="确认为何段">
              <FormSelect value={role} onChange={(e) => setRole(e.target.value as FlightLegRole)}>
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          )}
        </FormRow>
        <div className="flight-intel__actions">
          <button
            type="button"
            className="form-btn form-btn--primary"
            disabled={!canSearch || loading}
            onClick={() => void handleSearch()}
          >
            {loading
              ? '搜索中…'
              : isRoundTripSearch
                ? '搜索往返（Ignav）'
                : '搜索航班（Ignav）'}
          </button>
          <button
            type="button"
            className="form-btn"
            disabled={!canSearch || loading}
            onClick={() => void handleSearch({ forceRefresh: true })}
            title="忽略缓存重新查询"
          >
            刷新
          </button>
          {(latencyHint || cacheHint) && (
            <p className="flight-intel__hint">{cacheHint ?? latencyHint}</p>
          )}
          {error && <p className="flight-intel__error">{error}</p>}
        </div>
        <FlightManualAddPanel
          defaults={{
            origin,
            destination,
            departDate: date,
            purchaseUrl: searchResult?.purchase_url,
          }}
        />
      </div>

      {searchResult && (showRanked || (loading && ranked.length > 0)) && (
        <div className="flight-intel__section flight-intel__results">
          <div className="flight-intel__results-head">
            <p className="flight-intel__label">
              {isRoundTripSearch ? '往返推荐' : '推荐结果'}
            </p>
            {searchResult.purchase_url && (
              <a
                href={searchResult.purchase_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flight-intel__link"
              >
                Trip.com 实时价 →
              </a>
            )}
          </div>
          <p className="flight-intel__disclaimer">
            列表价为参考价（综合价/时长/中转/到达），下单以 Trip.com 等 OTA 实时价为准
          </p>
          {searchResult.warnings[0] && (
            <p className="flight-intel__warning">{searchResult.warnings[0]}</p>
          )}
          <div
            className={`flight-intel__offers-wrap${loading ? ' flight-intel__offers-wrap--loading' : ''}`}
          >
            {loading && ranked.length > 0 && (
              <div className="flight-intel__loading-overlay" aria-live="polite">
                <span>{latencyHint ?? '更新中…'}</span>
              </div>
            )}
            <div className="flight-intel__offers">
              {ranked.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  isRoundTripSearch={isRoundTripSearch}
                  onConfirm={() => confirmFlightQuote(offer.id, role)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
