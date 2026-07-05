import { useMemo, useState } from 'react';
import { searchFlights } from '../../api/flights';
import { usePlanStore } from '../../stores/usePlanStore';
import type { FlightLegRole, ConfirmedFlightLeg } from '../../types/travelIntel';
import {
  formatFlightLegSummary,
  flightIntelPanelBadgeLabel,
  getFlightIntelPanelPhase,
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
        <span className="flight-intel__offer-price">{formatPrice(offer)}</span>
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
}: {
  flights: ConfirmedFlightLeg[];
  purchaseUrl?: string;
  onContinue: () => void;
}) {
  const outbound = flights.find((f) => f.role === 'outbound');
  const inbound = flights.find((f) => f.role === 'return');
  const isRoundTrip = Boolean(outbound && inbound && outbound.bundle_id === inbound.bundle_id);
  const priceLeg = flights.find((f) => f.quote.price_amount > 0) ?? flights[0];

  return (
    <div className="flight-intel__confirmed">
      <p className="flight-intel__confirmed-title">
        {isRoundTrip ? '已选往返组合' : '已选航班'}
        {priceLeg && priceLeg.quote.price_amount > 0 && (
          <span className="flight-intel__confirmed-price">{formatPrice(priceLeg.quote)}</span>
        )}
      </p>
      {isRoundTrip && outbound && inbound ? (
        <div className="flight-intel__legs">
          <LegMetaRow label="去程" leg={outbound.quote} />
          <LegMetaRow label="回程" leg={inbound.quote} />
        </div>
      ) : (
        <ul className="flight-intel__confirmed-legs">
          {flights.map((leg) => (
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

  const tr = plan.trip_request;
  const intel = plan.travel_intel;

  const [origin, setOrigin] = useState(tr.departure ?? '');
  const [destination, setDestination] = useState(tr.destination ?? '');
  const [date, setDate] = useState(tr.date_start ?? '');
  const [returnDate, setReturnDate] = useState(tr.date_end ?? '');
  const [adults, setAdults] = useState(tr.travelers ?? 1);
  const [preference, setPreference] = useState<RankPreference>('balanced');
  const [role, setRole] = useState<FlightLegRole>('outbound');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchResult = intel.last_flight_search;
  const ranked = searchResult?.ranked ?? [];
  const hideRanked = Boolean(searchResult?.hide_ranked);
  const panelPhase = getFlightIntelPanelPhase(intel);
  const badgeLabel = flightIntelPanelBadgeLabel(panelPhase);
  const showConfirmedCard = intel.flights.length > 0 && hideRanked;
  const showRanked = ranked.length > 0 && !hideRanked;
  const isRoundTripSearch = Boolean(returnDate.trim());

  const canSearch = origin.trim() && destination.trim() && date.trim();

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
    return `单程搜索 · ${formatPreference(preference)} · 填返程日即切换往返`;
  }, [isRoundTripSearch, preference]);

  return (
    <section
      className={`flight-intel${layout === 'full' ? ' flight-intel--full' : ''}${panelPhase === 'done' ? ' flight-intel--done' : ''}`}
      aria-label="航班确认"
    >
      <header className="flight-intel__head">
        <div className="flight-intel__head-text">
          <h3 className="flight-intel__title">航班确认</h3>
          <p className="flight-intel__desc">
            App 内查价与确认；填返程日搜往返并一次确认两程。预订请用 Trip.com。
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
        />
      )}

      {intel.flights.length > 0 && (
        <div className="flight-intel__section">
          <p className="flight-intel__label">已确认航段</p>
          <ul className="flight-intel__leg-list">
            {intel.flights.map((leg) => (
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
