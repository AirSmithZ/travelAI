import { useMemo, useState } from 'react';
import { searchFlights } from '../../api/flights';
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
import {
  FormDateInput,
  FormField,
  FormInput,
  FormNumberInput,
  FormRow,
  FormSelect,
} from '../ui/FormField';
import './FlightIntelPanel.css';
import { FlightManualAddPanel } from './FlightManualAddPanel';

const ROLES: { id: FlightLegRole; label: string }[] = [
  { id: 'outbound', label: '去程' },
  { id: 'return', label: '回程' },
  { id: 'intercity', label: '城际' },
];

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

  return (
    <div className="flight-intel__confirmed">
      <p className="flight-intel__confirmed-title">
        {isRoundTrip && !hasIntercity
          ? '已选往返组合'
          : `已确认 ${sorted.length} 段航班`}
        {priceLeg && priceLeg.quote.price_amount > 0 && (
          <span className="flight-intel__confirmed-price">{formatPrice(priceLeg.quote)}</span>
        )}
      </p>
      {isRoundTrip && outbound && inbound && !hasIntercity ? (
        <div className="flight-intel__legs">
          <LegMetaRow label={`#${outbound.sequence} 去程`} leg={outbound.quote} />
          <LegMetaRow label={`#${inbound.sequence} 回程`} leg={inbound.quote} />
        </div>
      ) : (
        <ul className="flight-intel__confirmed-legs">
          {sorted.map((leg) => (
            <li key={leg.id} className="flight-intel__confirmed-leg">
              {formatFlightLegSummary(leg)}
            </li>
          ))}
        </ul>
      )}
      <div className="flight-intel__confirmed-actions">
        {purchaseUrl && (
          <a
            href={purchaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flight-intel__link flight-intel__link--cta"
          >
            Trip.com 预订 →
          </a>
        )}
        <button
          type="button"
          className="form-btn form-btn--sm"
          onClick={onAddNextLeg}
        >
          添加下一段
        </button>
        <button
          type="button"
          className="form-btn form-btn--sm form-btn--primary"
          onClick={onContinue}
        >
          继续 · 住宿片区
        </button>
      </div>
    </div>
  );
}

export function FlightIntelPanel({ layout = 'embedded' }: { layout?: 'embedded' | 'full' }) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const confirmFlightQuote = usePlanStore((s) => s.confirmFlightQuote);
  const removeFlightLeg = usePlanStore((s) => s.removeFlightLeg);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const mergeFlightSearchResult = usePlanStore((s) => s.mergeFlightSearchResult);

  const tr = plan.trip_request;
  const intel = plan.travel_intel;
  const sortedFlights = useMemo(
    () => sortFlightsBySequence(intel.flights),
    [intel.flights],
  );

  const [origin, setOrigin] = useState(tr.departure ?? '');
  const [destination, setDestination] = useState(tr.destination ?? '');
  const [date, setDate] = useState(tr.date_start ?? '');
  const [returnDate, setReturnDate] = useState(tr.date_end ?? '');
  const [adults, setAdults] = useState(tr.travelers ?? 1);
  const [preference, setPreference] = useState<RankPreference>('balanced');
  const [role, setRole] = useState<FlightLegRole>('outbound');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateHint, setTemplateHint] = useState<string | null>(null);

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
    if (suggestion.clearReturnDate) setReturnDate('');
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
      setDate(tr.date_start ?? date);
      setReturnDate((tr.date_end ?? returnDate) || '');
      setRole('outbound');
      setTemplateHint('模板：往返 · 填写返程日一次确认两程');
      if (searchResult?.hide_ranked) {
        mergeFlightSearchResult({ hide_ranked: false, confirmed_quote_id: null });
      }
      return;
    }
    if (kind === 'multicity') {
      if (intel.flights.length === 0) {
        setReturnDate('');
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

  async function handleSearch() {
    if (!canSearch || loading) return;
    setLeftPanelMode('flight');
    setLoading(true);
    setError(null);
    const ret = returnDate.trim();
    const requestKey = `${origin}-${destination}-${date}${ret ? `-rt-${ret}` : ''}`;
    try {
      const res = await searchFlights({
        origin: origin.trim(),
        destination: destination.trim(),
        date: date.trim(),
        return_date: ret || undefined,
        adults,
        preference,
        include_ignav: true,
        include_letsfg: false,
      });
      const newRanked = res.ranked ?? [];
      if (newRanked.length > 0) {
        usePlanStore.getState().setFlightSearchResult({
          request_key: requestKey,
          fetched_at: res.fetched_at,
          ranked: newRanked,
          purchase_url: res.purchase.url,
          warnings: res.warnings ?? [],
          is_round_trip: Boolean(ret),
          confirmed_quote_id: null,
          hide_ranked: false,
        });
      } else {
        const prev = usePlanStore.getState().getActivePlan().travel_intel.last_flight_search;
        if (prev) {
          usePlanStore.getState().mergeFlightSearchResult({
            warnings: res.warnings?.length ? res.warnings : prev.warnings,
            purchase_url: res.purchase.url || prev.purchase_url,
          });
        }
        setError(res.errors?.ignav ?? '未找到航班报价');
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
            <FormInput
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="上海 / SHA"
            />
          </FormField>
          <FormField label="到达">
            <FormInput
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="新加坡 / SIN"
            />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="出发日">
            <FormDateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="返程（往返）">
            <FormDateInput value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
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
          {latencyHint && <p className="flight-intel__hint">{latencyHint}</p>}
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
