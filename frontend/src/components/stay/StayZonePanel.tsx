import { useEffect, useMemo, useState } from 'react';
import { recommendStayZones } from '../../api/stayZones';
import { usePlanStore } from '../../stores/usePlanStore';
import { useToastStore } from '../../stores/useToastStore';
import type { StayZonePreferences } from '../../types/stayZone';
import {
  formatStayZoneDays,
  getStayZonePanelPhase,
  isStayZoneBookable,
  stayZoneFitTagLabel,
  stayZonePanelBadgeLabel,
  stayZoneThemeChips,
} from '../../types/stayZone';
import { cityLabelFromOutboundFlight } from '../../utils/flightArrivalCity';
import { validateHotelStays } from '../../utils/hotelStayValidate';
import { resolveAirportPlace } from '../../utils/resolveAirportPlace';
import type { StayHotelMapPin } from '../../utils/stayHotelMapPins';
import { isValidMapCoord } from '../../utils/mapCoordGuards';
import { ZoneAreaLodgingModule } from './ZoneAreaLodgingModule';
import { ZoneHotelNameSearchModule } from './ZoneHotelNameSearchModule';
import { candidateKey, type ZoneHotelCandidate } from './zoneHotelShared';
import './StayZonePanel.css';

function dedupeMessages(msgs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of msgs) {
    const t = m.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function pinSelected(
  picked: ZoneHotelCandidate | null,
  c: ZoneHotelCandidate,
): boolean {
  if (!picked) return false;
  return (
    (Boolean(picked.place_id) && picked.place_id === c.place_id) ||
    (picked.name === c.name && picked.lat === c.lat && picked.lng === c.lng)
  );
}

/**
 * Stay zone panel layout (P112):
 * 偏好 → 店名搜索（顶层）→ 推荐片区（仅片区附近）→ 已锁定酒店（公共）
 *
 * Map layers: name-search pins persist across zone switch;
 * area-lodging pins only for selectedStayZoneId; locked hotels always.
 */
export function StayZonePanel({ layout = 'embedded' }: { layout?: 'embedded' | 'full' }) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const itinerary = usePlanStore((s) => s.getItinerary());
  const intel = plan.travel_intel;
  const recommendStayZonesAction = usePlanStore((s) => s.recommendStayZones);
  const confirmStayZone = usePlanStore((s) => s.confirmStayZone);
  const rejectStayZone = usePlanStore((s) => s.rejectStayZone);
  const addHotelFromZone = usePlanStore((s) => s.addHotelFromZone);
  const addStandaloneHotel = usePlanStore((s) => s.addStandaloneHotel);
  const removeHotelStay = usePlanStore((s) => s.removeHotelStay);
  const setStayZonePreferences = usePlanStore((s) => s.setStayZonePreferences);
  const setSelectedStayZoneId = usePlanStore((s) => s.setSelectedStayZoneId);
  const selectedStayZoneId = usePlanStore((s) => s.selectedStayZoneId);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const setPreviewExpandedWithoutItinerary = usePlanStore(
    (s) => s.setPreviewExpandedWithoutItinerary,
  );
  const setStayHotelMapPins = usePlanStore((s) => s.setStayHotelMapPins);
  const stayHotelMapPinPickId = usePlanStore((s) => s.stayHotelMapPinPickId);
  const clearStayHotelMapPinPick = usePlanStore((s) => s.clearStayHotelMapPinPick);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const addChatMessage = usePlanStore((s) => s.addChatMessage);
  const showToast = useToastStore((s) => s.show);

  const zones = intel.recommended_stay_zones ?? [];
  const prefs = intel.stay_zone_preferences;
  const panelPhase = getStayZonePanelPhase(intel);
  const badgeLabel = stayZonePanelBadgeLabel(panelPhase);
  const hasItineraryDays = Boolean(itinerary?.days?.length);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState<string | null>(null);

  const [areaDraftByZone, setAreaDraftByZone] = useState<
    Record<string, ZoneHotelCandidate | null>
  >({});
  const [areaResultsByZone, setAreaResultsByZone] = useState<
    Record<string, ZoneHotelCandidate[]>
  >({});
  const [nameDraft, setNameDraft] = useState<ZoneHotelCandidate | null>(null);
  const [nameResults, setNameResults] = useState<ZoneHotelCandidate[]>([]);
  /** doc 36: seed name search when clicking a locked map pin */
  const [nameSearchSeed, setNameSearchSeed] = useState<string | null>(null);

  const hotelStayWarnings = useMemo(
    () => validateHotelStays(intel.hotels, plan.trip_request).warnings,
    [intel.hotels, plan.trip_request],
  );

  const canRecommend = Boolean(plan.trip_request.destination?.trim());
  const displayWarnings = useMemo(() => dedupeMessages(warnings), [warnings]);
  const standaloneLocked = intel.hotels.find((h) => !h.zone_id);

  /** HOT-TRIP-02 + HOT-ZONE-TAG: confirmed first, then fit_tag order */
  const zonesOrdered = useMemo(() => {
    const visible = zones.filter((z) => z.status !== 'rejected');
    const fitRank = (t?: string) => {
      switch (t) {
        case 'current_anchor':
          return 0;
        case 'preference_fit':
          return 1;
        case 'compromise':
          return 2;
        case 'needs_city_change':
          return 3;
        default:
          return 4;
      }
    };
    return [...visible].sort((a, b) => {
      const statusRank = (s: string) => (s === 'confirmed' ? 0 : s === 'proposed' ? 1 : 2);
      const d = statusRank(a.status) - statusRank(b.status);
      if (d !== 0) return d;
      const ft = fitRank(a.fit_tag) - fitRank(b.fit_tag);
      if (ft !== 0) return ft;
      return a.label.localeCompare(b.label, 'zh');
    });
  }, [zones]);

  const hotelsByZoneId = useMemo(() => {
    const map = new Map<string, typeof intel.hotels>();
    for (const h of intel.hotels) {
      const zid = h.zone_id || '__standalone__';
      const list = map.get(zid) ?? [];
      list.push(h);
      map.set(zid, list);
    }
    return map;
  }, [intel.hotels]);

  const lodgingAdults = plan.trip_request.travelers ?? 2;
  const lodgingMaxPrice = plan.trip_request.hotel_budget_per_night ?? null;

  const visibleZoneIds = useMemo(
    () => new Set(zonesOrdered.map((z) => z.id)),
    [zonesOrdered],
  );
  const orphanZoneHotels = useMemo(
    () =>
      intel.hotels.filter(
        (h) => Boolean(h.zone_id) && !visibleZoneIds.has(h.zone_id as string),
      ),
    [intel.hotels, visibleZoneIds],
  );

  /** Country-level destination (e.g. 新西兰) → hub city via /flights/airports before geocode bias. */
  const [resolvedDestCity, setResolvedDestCity] = useState('');
  const [flightArrivalCity, setFlightArrivalCity] = useState('');
  useEffect(() => {
    let cancelled = false;
    const dest = (plan.trip_request.destination || '').trim();
    if (!dest) {
      setResolvedDestCity('');
      return;
    }
    void resolveAirportPlace(dest).then((r) => {
      if (cancelled) return;
      setResolvedDestCity(r?.cityLabel ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [plan.trip_request.destination]);

  useEffect(() => {
    let cancelled = false;
    void cityLabelFromOutboundFlight(intel.flights).then((city) => {
      if (!cancelled) setFlightArrivalCity(city);
    });
    return () => {
      cancelled = true;
    };
  }, [intel.flights]);

  /** P113/P117: geocode bias — zone.city → flight arrival city → resolved city (never raw country). */
  const hotelGeocodeCity = useMemo(() => {
    const dest = (plan.trip_request.destination || '').trim();
    const fallback = resolvedDestCity || '';
    const selected = zones.find((z) => z.id === selectedStayZoneId);
    const selectedCity = (selected?.city || '').trim();
    if (selectedCity && selectedCity !== dest) return selectedCity;
    const otherCity = zones
      .map((z) => (z.city || '').trim())
      .find((c) => c && c !== dest);
    if (otherCity) return otherCity;
    if (selectedCity) return selectedCity;
    if (flightArrivalCity && flightArrivalCity !== dest) return flightArrivalCity;
    return flightArrivalCity || fallback;
  }, [
    zones,
    selectedStayZoneId,
    plan.trip_request.destination,
    flightArrivalCity,
    resolvedDestCity,
  ]);

  function openMapPreview() {
    setActiveView('map');
    setPreviewExpandedWithoutItinerary(true);
  }

  function activateMapForZone(zoneId: string) {
    setSelectedStayZoneId(zoneId);
    openMapPreview();
  }

  // Map pins: name (global) ∪ selected-zone area ∪ locked hotels
  useEffect(() => {
    const pins: StayHotelMapPin[] = [];
    const seen = new Set<string>();

    const pushPin = (p: StayHotelMapPin) => {
      if (!isValidMapCoord(p.lat, p.lng)) return;
      const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      if (seen.has(key) && !p.selected) return;
      if (seen.has(key) && p.selected) {
        const idx = pins.findIndex(
          (x) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}` === key,
        );
        if (idx >= 0) pins[idx] = { ...pins[idx], selected: true, name: p.name };
        return;
      }
      seen.add(key);
      pins.push(p);
    };

    for (const c of nameResults) {
      pushPin({
        id: `name:${candidateKey(c)}`,
        name: c.name,
        lat: Number(c.lat),
        lng: Number(c.lng),
        selected: pinSelected(nameDraft, c),
      });
    }

    const areaList =
      selectedStayZoneId != null
        ? (areaResultsByZone[selectedStayZoneId] ?? [])
        : [];
    const areaDraft =
      selectedStayZoneId != null
        ? (areaDraftByZone[selectedStayZoneId] ?? null)
        : null;
    for (const c of areaList) {
      pushPin({
        id: `area:${candidateKey(c)}`,
        name: c.name,
        lat: Number(c.lat),
        lng: Number(c.lng),
        selected: pinSelected(areaDraft, c),
      });
    }

    for (const h of intel.hotels) {
      if (!isValidMapCoord(Number(h.lat), Number(h.lng))) continue;
      pushPin({
        id: `locked:${h.id}`,
        name: h.name,
        lat: Number(h.lat),
        lng: Number(h.lng),
        selected: true,
      });
    }

    setStayHotelMapPins(pins);

    if (pins.length === 0 && !hasItineraryDays) {
      const hasGeom = (intel.recommended_stay_zones ?? []).some((z) => Boolean(z.geometry));
      if (!hasGeom) setPreviewExpandedWithoutItinerary(false);
    }
  }, [
    nameResults,
    nameDraft,
    selectedStayZoneId,
    areaResultsByZone,
    areaDraftByZone,
    intel.hotels,
    intel.recommended_stay_zones,
    hasItineraryDays,
    setStayHotelMapPins,
    setPreviewExpandedWithoutItinerary,
  ]);

  useEffect(() => {
    return () => setStayHotelMapPins([]);
  }, [setStayHotelMapPins]);

  // Map marker click → name results, area results, or locked pin → replace flow (doc 36)
  useEffect(() => {
    if (!stayHotelMapPinPickId) return;
    const pick = stayHotelMapPinPickId;
    if (pick.startsWith('locked:')) {
      const hotelId = pick.slice('locked:'.length);
      const hotel = intel.hotels.find((h) => h.id === hotelId);
      if (hotel?.name) {
        setNameSearchSeed(`${hotel.name}·${Date.now()}`);
        setNameDraft(null);
        showToast(`点击锁定钉：在上方店名搜索中输入新店以替换「${hotel.name}」`, 'info');
        setActiveView('map');
        setPreviewExpandedWithoutItinerary(true);
      }
      clearStayHotelMapPinPick();
      return;
    }
    const nameHit = nameResults.find(
      (c) =>
        `name:${candidateKey(c)}` === pick ||
        candidateKey(c) === pick ||
        c.place_id === pick ||
        c.name === pick,
    );
    if (nameHit) {
      setNameDraft(nameHit);
      clearStayHotelMapPinPick();
      return;
    }
    if (selectedStayZoneId) {
      const list = areaResultsByZone[selectedStayZoneId] ?? [];
      const areaHit = list.find(
        (c) =>
          `area:${candidateKey(c)}` === pick ||
          candidateKey(c) === pick ||
          c.place_id === pick ||
          c.name === pick,
      );
      if (areaHit) {
        setAreaDraftByZone((m) => ({ ...m, [selectedStayZoneId]: areaHit }));
      }
    }
    clearStayHotelMapPinPick();
  }, [
    stayHotelMapPinPickId,
    nameResults,
    selectedStayZoneId,
    areaResultsByZone,
    clearStayHotelMapPinPick,
    intel.hotels,
    showToast,
    setActiveView,
    setPreviewExpandedWithoutItinerary,
  ]);

  async function handleRecommend() {
    if (!canRecommend || loading) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await recommendStayZones({
        trip_request: plan.trip_request,
        flights: intel.flights,
        itinerary,
        preferences: prefs,
      });
      recommendStayZonesAction(res.zones, res.fetched_at, res.prompt_themes ?? []);
      setWarnings(dedupeMessages(res.warnings ?? []));
      if (res.zones[0]) setSelectedStayZoneId(res.zones[0].id);
      if (hasItineraryDays) setActiveView('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : '推荐失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleLockAreaHotel(zoneId: string, candidate: ZoneHotelCandidate) {
    if (!isValidMapCoord(Number(candidate.lat), Number(candidate.lng))) {
      showToast('该候选缺少有效坐标，无法锁定', 'warning');
      return;
    }
    setAddLoading(zoneId);
    setError(null);
    try {
      const hotelId = addHotelFromZone(zoneId, {
        name: candidate.name,
        lat: candidate.lat,
        lng: candidate.lng,
        address: candidate.address ?? undefined,
        coord_source: candidate.coord_source ?? 'serpapi',
      });
      if (hotelId) {
        setAreaDraftByZone((m) => ({ ...m, [zoneId]: null }));
        if (hasItineraryDays) openMapPreview();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '锁定失败');
      showToast(e instanceof Error ? e.message : '锁定失败', 'warning');
    } finally {
      setAddLoading(null);
    }
  }

  async function handleLockNameHotel(candidate: ZoneHotelCandidate) {
    if (!isValidMapCoord(Number(candidate.lat), Number(candidate.lng))) {
      showToast('该候选缺少有效坐标，无法锁定', 'warning');
      return;
    }
    setAddLoading('name');
    setError(null);
    try {
      const hotelId = addStandaloneHotel({
        name: candidate.name,
        lat: candidate.lat,
        lng: candidate.lng,
        address: candidate.address ?? undefined,
        coord_source: candidate.coord_source ?? 'geocode',
        city: hotelGeocodeCity || resolvedDestCity || plan.trip_request.destination,
      });
      if (hotelId) {
        setNameDraft(null);
        if (hasItineraryDays) openMapPreview();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '锁定失败');
      showToast(e instanceof Error ? e.message : '锁定失败', 'warning');
    } finally {
      setAddLoading(null);
    }
  }

  return (
    <section
      className={`stay-zone${layout === 'full' ? ' stay-zone--full' : ''}${panelPhase === 'done' ? ' stay-zone--done' : ''}`}
      aria-label="住宿片区"
    >
      <header className="stay-zone__head">
        <div className="stay-zone__head-text">
          <h3 className="stay-zone__title">住宿片区</h3>
          <p className="stay-zone__desc">
            {hasItineraryDays
              ? '玩法已生成仍可换店：上方「店名搜索」替换锁定；地图上点已锁钉可预填店名。锁定后会重铺日闭环，可用顶部横幅优化/重构。'
              : '生成玩法前请锁定具体酒店。店名搜索不绑定片区；片区附近仅作用于当前选中片区。检索后点「替换/锁定」。'}
          </p>
        </div>
        <span
          className={`stay-zone__badge stay-zone__badge--${panelPhase}`}
          title="状态徽标（非搜索入口）"
        >
          {badgeLabel}
        </span>
      </header>

      <StayZonePreferenceForm
        preferences={prefs}
        onChange={(p) => setStayZonePreferences(p)}
      />

      <div className="stay-zone__actions">
        <button
          type="button"
          className="form-btn form-btn--primary"
          disabled={!canRecommend || loading}
          onClick={() => void handleRecommend()}
        >
          {loading ? '推荐中…' : hasItineraryDays ? '推荐住宿片区' : '粗推住宿片区'}
        </button>
        {intel.stay_zones_fetched_at && (
          <p className="stay-zone__meta">
            上次更新 · {new Date(intel.stay_zones_fetched_at).toLocaleString()}
          </p>
        )}
        {(intel.stay_prompt_themes ?? []).filter((t) => t.polarity !== 'negative').length >
          0 && (
          <p className="stay-zone__themes-summary" role="status">
            已从描述识别：
            {(intel.stay_prompt_themes ?? [])
              .filter((t) => t.polarity !== 'negative')
              .map((t) => t.label)
              .slice(0, 8)
              .join(' · ')}
          </p>
        )}
        {error && (
          <p className="stay-zone__error" role="alert">
            {error}
          </p>
        )}
        {displayWarnings
          .filter((w) => !w.startsWith('已从描述识别'))
          .slice(0, 2)
          .map((w) => (
            <p key={w} className="stay-zone__warning">
              {w}
            </p>
          ))}
      </div>

      {loading && zones.length === 0 && (
        <div className="stay-zone__skeleton" aria-busy="true" aria-label="正在推荐片区">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`stay-zone__skeleton-card${i === 1 ? ' stay-zone__skeleton-card--short' : ''}`}
            >
              <div className="stay-zone__skeleton-line stay-zone__skeleton-line--title" />
              <div className="stay-zone__skeleton-line stay-zone__skeleton-line--meta" />
              <div className="stay-zone__skeleton-line" />
              <div className="stay-zone__skeleton-line stay-zone__skeleton-line--body" />
              <div className="stay-zone__skeleton-foot">
                <div className="stay-zone__skeleton-line stay-zone__skeleton-line--btn" />
                <div className="stay-zone__skeleton-line stay-zone__skeleton-line--btn-sm" />
              </div>
            </div>
          ))}
          <p className="stay-zone__meta">正在按目的地与日期粗推片区…</p>
        </div>
      )}

      {/* P112: 店名搜索 — 顶层模块，在「推荐片区」之上 */}
      <div className="stay-zone__section">
        <p className="stay-zone__label">店名搜索</p>
        <ZoneHotelNameSearchModule
          destination={hotelGeocodeCity}
          draft={nameDraft}
          lockedName={
            standaloneLocked?.name ||
            (intel.hotels.length === 1 ? intel.hotels[0]?.name : null)
          }
          locking={addLoading === 'name'}
          seedQuery={nameSearchSeed}
          onDraftChange={setNameDraft}
          onResultsChange={setNameResults}
          onActivateMap={openMapPreview}
          onLock={(c) => void handleLockNameHotel(c)}
        />
      </div>

      {zonesOrdered.length > 0 && (
        <div className="stay-zone__section">
          <p className="stay-zone__label">推荐片区</p>
          <div className="stay-zone__cards">
            {zonesOrdered.map((zone) => {
                const locked = intel.hotels.find((h) => h.zone_id === zone.id);
                const zoneHotels = hotelsByZoneId.get(zone.id) ?? [];
                const areaDraft = areaDraftByZone[zone.id] ?? null;
                const hasOutline = zone.geometry?.type === 'circle';
                const bookable = isStayZoneBookable(zone);
                const fitTag = zone.fit_tag ?? 'current_anchor';
                const { shown: themeShown, overflow: themeOverflow } = stayZoneThemeChips(
                  zone.matched_themes,
                );
                const uncovered = (zone.uncovered_themes ?? []).slice(0, 3);
                return (
                  <article
                    key={zone.id}
                    className={`stay-zone__card${selectedStayZoneId === zone.id ? ' stay-zone__card--selected' : ''}${zone.status === 'confirmed' ? ' stay-zone__card--confirmed' : ''}${!bookable ? ' stay-zone__card--unbookable' : ''}`}
                    onMouseEnter={() => setSelectedStayZoneId(zone.id)}
                  >
                    <div className="stay-zone__card-tags" aria-label="片区标签">
                      {themeShown.map((t) => (
                        <span key={t.id} className="stay-zone__theme-tag">
                          {t.label}
                        </span>
                      ))}
                      {themeOverflow > 0 ? (
                        <span className="stay-zone__theme-tag stay-zone__theme-tag--more">
                          +{themeOverflow}
                        </span>
                      ) : null}
                      {uncovered.map((t) => (
                        <span
                          key={`u-${t.id}`}
                          className="stay-zone__theme-tag stay-zone__theme-tag--uncovered"
                          title="本片区未覆盖该主题"
                        >
                          未覆盖 · {t.label}
                        </span>
                      ))}
                      <span
                        className={`stay-zone__fit-tag stay-zone__fit-tag--${fitTag} stay-zone__fit-tag--secondary`}
                      >
                        {stayZoneFitTagLabel(fitTag)}
                      </span>
                      {!bookable ? (
                        <span className="stay-zone__fit-tag stay-zone__fit-tag--locked">
                          不可锁店
                        </span>
                      ) : null}
                    </div>
                    <div className="stay-zone__card-top">
                      <h4 className="stay-zone__card-title">{zone.label}</h4>
                      <span className="stay-zone__card-city">{zone.city}</span>
                    </div>
                    {zone.tag_note ? (
                      <p className="stay-zone__tag-note">{zone.tag_note}</p>
                    ) : null}
                    <p className="stay-zone__card-days">{formatStayZoneDays(zone)}</p>
                    <p className="stay-zone__card-rationale">{zone.rationale}</p>
                    {zone.transit_note && (
                      <p className="stay-zone__card-transit">{zone.transit_note}</p>
                    )}
                    {!bookable ? (
                      <p className="stay-zone__warning" role="status">
                        与当前机酒目的地不同城：请先在对话中改目的地/航班，或忽略此备选
                      </p>
                    ) : !hasOutline ? (
                      <p className="stay-zone__warning" role="status">
                        尚无地图轮廓 · 不提供「附近搜店」；请用 Trip 或店名搜索
                      </p>
                    ) : null}
                    <div className="stay-zone__card-foot">
                      {zone.purchase_url && bookable && (
                        <a
                          href={zone.purchase_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="stay-zone__link"
                        >
                          Trip.com 预订 →
                        </a>
                      )}
                      {!bookable ? (
                        <>
                          <button
                            type="button"
                            className="form-btn form-btn--sm form-btn--primary"
                            onClick={() => {
                              addChatMessage(
                                'assistant',
                                `「${zone.label}」（${zone.city}）更贴合偏好，但与当前目的地不同。可在下方输入：「把目的地改成${zone.city}」；改完后请重新确认航班并粗推片区。`,
                              );
                              setLeftPanelMode('chat');
                              showToast('已切到对话 · 可改目的地', 'info');
                            }}
                          >
                            去对话改目的地
                          </button>
                          <button
                            type="button"
                            className="form-btn form-btn--sm"
                            onClick={() => rejectStayZone(zone.id)}
                          >
                            忽略
                          </button>
                        </>
                      ) : zone.status === 'proposed' ? (
                        <>
                          <button
                            type="button"
                            className="form-btn form-btn--sm form-btn--primary"
                            onClick={() => confirmStayZone(zone.id)}
                          >
                            确认片区
                          </button>
                          <button
                            type="button"
                            className="form-btn form-btn--sm"
                            onClick={() => rejectStayZone(zone.id)}
                          >
                            忽略
                          </button>
                        </>
                      ) : (
                        <span className="stay-zone__confirmed-tag">已确认 · 可锁定酒店</span>
                      )}
                    </div>

                    {zoneHotels.length > 0 ? (
                      <ul className="stay-zone__hotel-list stay-zone__hotel-list--in-card">
                        {zoneHotels.map((h) => (
                          <li key={h.id} className="stay-zone__hotel">
                            <span>
                              已锁 · {h.name} · {h.check_in}→{h.check_out}
                            </span>
                            <button
                              type="button"
                              className="form-btn form-btn--sm form-btn--danger"
                              onClick={() => removeHotelStay(h.id)}
                            >
                              移除
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {bookable && zone.status === 'confirmed' && (
                      <div className="stay-zone__hotel-modules">
                        <ZoneAreaLodgingModule
                          zone={zone}
                          draft={areaDraft}
                          lockedName={locked?.name}
                          locking={addLoading === zone.id}
                          checkIn={zone.check_in || plan.trip_request.date_start}
                          checkOut={
                            zone.check_out ||
                            plan.trip_request.date_end ||
                            plan.trip_request.date_start
                          }
                          adults={lodgingAdults}
                          maxPrice={lodgingMaxPrice}
                          onDraftChange={(c) =>
                            setAreaDraftByZone((m) => ({ ...m, [zone.id]: c }))
                          }
                          onResultsChange={(items) =>
                            setAreaResultsByZone((m) => ({ ...m, [zone.id]: items }))
                          }
                          onActivateMap={() => activateMapForZone(zone.id)}
                          onLock={(c) => void handleLockAreaHotel(zone.id, c)}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
        </div>
      )}

      {(standaloneLocked || hotelStayWarnings.length > 0 || orphanZoneHotels.length > 0) && (
        <div className="stay-zone__section">
          <p className="stay-zone__label">店名直锁 / 住宿校验</p>
          {hotelStayWarnings.map((w) => (
            <p key={w} className="stay-zone__warning">
              {w}
            </p>
          ))}
          {(standaloneLocked || orphanZoneHotels.length > 0) && (
            <ul className="stay-zone__hotel-list">
              {standaloneLocked ? (
                <li key={standaloneLocked.id} className="stay-zone__hotel">
                  <span>
                    {standaloneLocked.name} · {standaloneLocked.city} ·{' '}
                    {standaloneLocked.check_in}→{standaloneLocked.check_out}
                    {' · 店名直锁'}
                  </span>
                  <button
                    type="button"
                    className="form-btn form-btn--sm form-btn--danger"
                    onClick={() => removeHotelStay(standaloneLocked.id)}
                  >
                    移除
                  </button>
                </li>
              ) : null}
              {orphanZoneHotels.map((h) => (
                <li key={h.id} className="stay-zone__hotel">
                  <span>
                    {h.name} · {h.city} · {h.check_in}→{h.check_out}
                    {' · 片区已不在列表'}
                  </span>
                  <button
                    type="button"
                    className="form-btn form-btn--sm form-btn--danger"
                    onClick={() => removeHotelStay(h.id)}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function StayZonePreferenceForm({
  preferences,
  onChange,
}: {
  preferences?: StayZonePreferences;
  onChange: (p: StayZonePreferences) => void;
}) {
  const updateTripRequest = usePlanStore((s) => s.updateTripRequest);
  const hotelBudget = usePlanStore((s) => s.getActivePlan().trip_request.hotel_budget_per_night);
  const p = preferences ?? { transit: 1.0, minimize_hotel_moves: true, walk_tolerance: 'medium' };
  const minimizeMoves = p.minimize_hotel_moves !== false;
  const safetyOn = p.safety_sensitive === true;

  return (
    <div className="stay-zone__prefs">
      <div className="stay-zone__prefs-head">
        <p className="stay-zone__label">推荐偏好</p>
        <p className="stay-zone__prefs-hint">默认偏公交枢纽；下列选项会随「粗推片区」一并提交</p>
      </div>
      <div className="stay-zone__pref-chips" role="group" aria-label="住宿片区偏好">
        <button
          type="button"
          className={`stay-zone__pref-chip${minimizeMoves ? ' stay-zone__pref-chip--on' : ''}`}
          aria-pressed={minimizeMoves}
          title="倾向折中片区，减少搬店"
          onClick={() => onChange({ ...p, minimize_hotel_moves: !minimizeMoves })}
        >
          少换酒店
        </button>
        <button
          type="button"
          className={`stay-zone__pref-chip${safetyOn ? ' stay-zone__pref-chip--on' : ''}`}
          aria-pressed={safetyOn}
          title="枢纽评分略加权安全相关信号"
          onClick={() => onChange({ ...p, safety_sensitive: !safetyOn })}
        >
          安全敏感
        </button>
        <span className="stay-zone__pref-chip stay-zone__pref-chip--locked" title="始终加权公交枢纽">
          公交优先
        </span>
      </div>
      <label className="stay-zone__budget">
        <span>每晚预算上限（可选，写入 Trip.com 深链）</span>
        <input
          type="number"
          min={0}
          step={50}
          placeholder="如 800"
          value={hotelBudget ?? p.budget ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateTripRequest({ hotel_budget_per_night: undefined });
              onChange({ ...p, budget: undefined });
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) return;
            updateTripRequest({ hotel_budget_per_night: n });
            onChange({ ...p, budget: n });
          }}
        />
      </label>
    </div>
  );
}
