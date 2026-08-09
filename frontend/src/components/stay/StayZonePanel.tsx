import { useMemo, useState } from 'react';
import { recommendStayZones, searchStayZoneLodging, type StayZoneLodgingCandidate } from '../../api/stayZones';
import {
  LODGING_CACHE_TTL_MS,
  cacheGet,
  cacheInvalidate,
  cacheSet,
  lodgingCacheKey,
} from '../../utils/searchResultCache';
import { geocodeAutocomplete } from '../../api/geocode';
import { usePlanStore } from '../../stores/usePlanStore';
import { useToastStore } from '../../stores/useToastStore';
import type { StayZonePreferences } from '../../types/stayZone';
import {
  formatStayZoneDays,
  getStayZonePanelPhase,
  stayZonePanelBadgeLabel,
} from '../../types/stayZone';
import { validateHotelStays } from '../../utils/hotelStayValidate';
import {
  FormField,
  FormInput,
  FormRow,
} from '../ui/FormField';
import './StayZonePanel.css';

export function StayZonePanel({ layout = 'embedded' }: { layout?: 'embedded' | 'full' }) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const itinerary = usePlanStore((s) => s.getItinerary());
  const intel = plan.travel_intel;
  const recommendStayZonesAction = usePlanStore((s) => s.recommendStayZones);
  const confirmStayZone = usePlanStore((s) => s.confirmStayZone);
  const rejectStayZone = usePlanStore((s) => s.rejectStayZone);
  const addHotelFromZone = usePlanStore((s) => s.addHotelFromZone);
  const removeHotelStay = usePlanStore((s) => s.removeHotelStay);
  const setStayZonePreferences = usePlanStore((s) => s.setStayZonePreferences);
  const setSelectedStayZoneId = usePlanStore((s) => s.setSelectedStayZoneId);
  const selectedStayZoneId = usePlanStore((s) => s.selectedStayZoneId);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const setPreviewExpandedWithoutItinerary = usePlanStore(
    (s) => s.setPreviewExpandedWithoutItinerary,
  );
  const showToast = useToastStore((s) => s.show);

  const zones = intel.recommended_stay_zones ?? [];
  const prefs = intel.stay_zone_preferences;
  const panelPhase = getStayZonePanelPhase(intel);
  const badgeLabel = stayZonePanelBadgeLabel(panelPhase);
  const hasItineraryDays = Boolean(itinerary?.days?.length);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [expandedAddId, setExpandedAddId] = useState<string | null>(null);
  const [hotelNames, setHotelNames] = useState<Record<string, string>>({});
  const [pickedLodging, setPickedLodging] = useState<
    Record<string, StayZoneLodgingCandidate | null>
  >({});
  const [addLoading, setAddLoading] = useState<string | null>(null);
  const [lodgingByZone, setLodgingByZone] = useState<Record<string, StayZoneLodgingCandidate[]>>({});
  const [lodgingLoading, setLodgingLoading] = useState<string | null>(null);

  const hotelStayWarnings = useMemo(
    () => validateHotelStays(intel.hotels, plan.trip_request).warnings,
    [intel.hotels, plan.trip_request],
  );

  const canRecommend = Boolean(plan.trip_request.destination?.trim());

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
      recommendStayZonesAction(res.zones, res.fetched_at);
      setWarnings(res.warnings ?? []);
      if (res.zones[0]) setSelectedStayZoneId(res.zones[0].id);
      setActiveView('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : '推荐失败');
    } finally {
      setLoading(false);
    }
  }

  function openHotelPicker(zoneId: string) {
    const next = expandedAddId === zoneId ? null : zoneId;
    setExpandedAddId(next);
    if (!next) return;
    setHotelNames((m) => (m[zoneId] !== undefined ? m : { ...m, [zoneId]: '' }));
    setPickedLodging((m) => ({ ...m, [zoneId]: m[zoneId] ?? null }));
    void handleSearchLodging(zoneId);
  }

  async function handleAddHotel(zoneId: string) {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) return;
    const picked = pickedLodging[zoneId];
    const name = (hotelNames[zoneId] ?? picked?.name ?? '').trim();
    if (!name) {
      showToast('请先从下方列表选择酒店，或手动输入酒店名称', 'warning');
      return;
    }
    setAddLoading(zoneId);
    setError(null);
    try {
      if (picked && picked.name === name) {
        const hotelId = addHotelFromZone(zoneId, {
          name,
          lat: picked.lat,
          lng: picked.lng,
          address: picked.address ?? undefined,
          coord_source: picked.coord_source ?? 'serpapi_lodging',
        });
        if (hotelId) {
          setExpandedAddId(null);
          if (hasItineraryDays) {
            setLeftPanelMode('form');
            setActiveView('map');
            setPreviewExpandedWithoutItinerary(true);
          }
        }
        return;
      }

      let lat: number | undefined;
      let lng: number | undefined;
      let address: string | undefined;
      const geo = await geocodeAutocomplete(name, zone.city);
      if (geo.results[0]) {
        lat = geo.results[0].lat;
        lng = geo.results[0].lng;
        address = geo.results[0].address;
      } else if (zone.geometry?.type === 'circle') {
        lat = zone.geometry.center.lat;
        lng = zone.geometry.center.lng;
      }
      if (lat == null || lng == null) {
        if (!hasItineraryDays) {
          showToast('生成前请从列表选择带位置的酒店，或手输可检索到的店名', 'warning');
          return;
        }
        const hotelId = addHotelFromZone(zoneId, {
          name,
          lat: zone.geometry?.type === 'circle' ? zone.geometry.center.lat : 0,
          lng: zone.geometry?.type === 'circle' ? zone.geometry.center.lng : 0,
          pendingMapPick: true,
        });
        if (hotelId) {
          setActiveView('map');
          setLeftPanelMode('form');
          setPreviewExpandedWithoutItinerary(true);
          setExpandedAddId(null);
        }
        return;
      }
      const hotelId = addHotelFromZone(zoneId, {
        name,
        lat,
        lng,
        address,
        coord_source: 'geocode',
      });
      if (hotelId) {
        setExpandedAddId(null);
        if (hasItineraryDays) {
          setLeftPanelMode('form');
          setActiveView('map');
          setPreviewExpandedWithoutItinerary(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败');
      showToast(e instanceof Error ? e.message : '添加失败', 'warning');
    } finally {
      setAddLoading(null);
    }
  }

  async function handleSearchLodging(zoneId: string, opts?: { forceRefresh?: boolean }) {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone?.geometry || zone.geometry.type !== 'circle') {
      setError('该片区无圆心坐标，无法检索附近酒店');
      return;
    }
    setLodgingLoading(zoneId);
    setError(null);
    const radius = zone.geometry.radius_m ?? 1200;
    const key = lodgingCacheKey({
      zoneId: zone.id,
      lat: zone.geometry.center.lat,
      lng: zone.geometry.center.lng,
      radiusM: radius,
    });
    try {
      const cached = opts?.forceRefresh
        ? null
        : cacheGet<{ candidates: StayZoneLodgingCandidate[]; warnings: string[] }>(
            'lodging',
            key,
            LODGING_CACHE_TTL_MS,
          );
      // P70 同理：仅复用非空 lodging 缓存
      if (cached && cached.value.candidates.length > 0) {
        setLodgingByZone((m) => ({ ...m, [zoneId]: cached.value.candidates }));
        return;
      }
      if (cached) cacheInvalidate('lodging', key);

      const res = await searchStayZoneLodging({
        zone_id: zone.id,
        city: zone.city,
        label: zone.label,
        lat: zone.geometry.center.lat,
        lng: zone.geometry.center.lng,
        radius_m: radius,
      });
      if (res.candidates.length > 0) {
        cacheSet('lodging', key, { candidates: res.candidates, warnings: res.warnings });
      }
      setLodgingByZone((m) => ({ ...m, [zoneId]: res.candidates }));
      if (res.candidates.length === 0) {
        setError('片区内暂无酒店候选，可手动输入名称后确认添加');
      }
      if (res.warnings[0]) setWarnings((w) => [...w, res.warnings[0]!]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '酒店检索失败');
    } finally {
      setLodgingLoading(null);
    }
  }

  function handlePickLodging(zoneId: string, c: StayZoneLodgingCandidate) {
    // P75: 选中候选 → 填入名称，等「确认添加」
    setHotelNames((m) => ({ ...m, [zoneId]: c.name }));
    setPickedLodging((m) => ({ ...m, [zoneId]: c }));
  }

  const confirmedZones = useMemo(
    () => zones.filter((z) => z.status === 'confirmed'),
    [zones],
  );

  return (
    <section
      className={`stay-zone${layout === 'full' ? ' stay-zone--full' : ''}${panelPhase === 'done' ? ' stay-zone--done' : ''}`}
      aria-label="住宿片区"
    >
      <header className="stay-zone__head">
        <div className="stay-zone__head-text">
          <h3 className="stay-zone__title">住宿片区</h3>
          <p className="stay-zone__desc">
            完善路线图后推荐适合居住的区域；确认后在地图查看并添加酒店节点。
          </p>
        </div>
        <span className={`stay-zone__badge stay-zone__badge--${panelPhase}`}>{badgeLabel}</span>
      </header>

      {!itinerary && (
        <p className="stay-zone__hint">请先生成并完善路线图，推荐结果会更准确。</p>
      )}

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
          {loading ? '推荐中…' : itinerary ? '推荐住宿片区' : '粗推住宿片区'}
        </button>
        {intel.stay_zones_fetched_at && (
          <p className="stay-zone__meta">
            上次更新 · {new Date(intel.stay_zones_fetched_at).toLocaleString()}
          </p>
        )}
        {error && <p className="stay-zone__error">{error}</p>}
        {warnings.map((w) => (
          <p key={w} className="stay-zone__warning">{w}</p>
        ))}
      </div>

      {intel.hotels.length > 0 && (
        <div className="stay-zone__section">
          <p className="stay-zone__label">已添加酒店</p>
          {hotelStayWarnings.map((w) => (
            <p key={w} className="stay-zone__warning">
              {w}
            </p>
          ))}
          <ul className="stay-zone__hotel-list">
            {intel.hotels.map((h) => (
              <li key={h.id} className="stay-zone__hotel">
                <span>{h.name} · {h.city} · {h.check_in}→{h.check_out}</span>
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
        </div>
      )}

      {zones.filter((z) => z.status !== 'rejected').length > 0 && (
        <div className="stay-zone__section">
          <p className="stay-zone__label">推荐片区</p>
          <div className="stay-zone__cards">
            {zones
              .filter((z) => z.status !== 'rejected')
              .map((zone) => (
                <article
                  key={zone.id}
                  className={`stay-zone__card${selectedStayZoneId === zone.id ? ' stay-zone__card--selected' : ''}${zone.status === 'confirmed' ? ' stay-zone__card--confirmed' : ''}`}
                  onMouseEnter={() => setSelectedStayZoneId(zone.id)}
                >
                  <div className="stay-zone__card-top">
                    <h4 className="stay-zone__card-title">{zone.label}</h4>
                    <span className="stay-zone__card-city">{zone.city}</span>
                  </div>
                  <p className="stay-zone__card-days">{formatStayZoneDays(zone)}</p>
                  <p className="stay-zone__card-rationale">{zone.rationale}</p>
                  {zone.transit_note && (
                    <p className="stay-zone__card-transit">{zone.transit_note}</p>
                  )}
                  <div className="stay-zone__card-foot">
                    {zone.purchase_url && (
                      <a
                        href={zone.purchase_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="stay-zone__link"
                      >
                        Trip.com 预订 →
                      </a>
                    )}
                    {zone.status === 'proposed' ? (
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
                      <button
                        type="button"
                        className="form-btn form-btn--sm form-btn--primary"
                        onClick={() => openHotelPicker(zone.id)}
                      >
                        {expandedAddId === zone.id ? '收起选酒店' : '在此片区选酒店'}
                      </button>
                    )}
                  </div>
                  {expandedAddId === zone.id && zone.status === 'confirmed' && (
                    <div className="stay-zone__add">
                      <p className="stay-zone__add-step">
                        片区「{zone.label}」已确认 · 下一步：从列表选酒店（或手输名称）后确认添加
                      </p>
                      {!hasItineraryDays && (
                        <p className="stay-zone__add-hint">
                          生成前须锁定具体酒店（写入住宿锚点）；生成后会按「酒店→行程→酒店」写入路线图。
                        </p>
                      )}
                      <FormField label="已选酒店">
                        <FormInput
                          value={hotelNames[zone.id] ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setHotelNames((m) => ({ ...m, [zone.id]: v }));
                            setPickedLodging((m) => {
                              const cur = m[zone.id];
                              if (cur && cur.name !== v) return { ...m, [zone.id]: null };
                              return m;
                            });
                          }}
                          placeholder="点击下方酒店，或手动输入名称"
                        />
                      </FormField>
                      <p className="stay-zone__add-hint">
                        列表为片区内酒店候选（无平台报价，预订走 Trip.com）；选定后点「锁定酒店」。有行程时将同步日闭环。
                      </p>
                      <div className="stay-zone__add-actions">
                        <button
                          type="button"
                          className="form-btn form-btn--sm"
                          disabled={lodgingLoading === zone.id}
                          onClick={() => void handleSearchLodging(zone.id)}
                        >
                          {lodgingLoading === zone.id ? '检索中…' : '搜索片区酒店'}
                        </button>
                        <button
                          type="button"
                          className="form-btn"
                          disabled={lodgingLoading === zone.id}
                          onClick={() => void handleSearchLodging(zone.id, { forceRefresh: true })}
                          title="忽略缓存重新检索"
                        >
                          刷新
                        </button>
                        <button
                          type="button"
                          className="form-btn form-btn--sm form-btn--primary"
                          disabled={addLoading === zone.id}
                          onClick={() => void handleAddHotel(zone.id)}
                        >
                          {addLoading === zone.id
                            ? '锁定中…'
                            : hasItineraryDays
                              ? '锁定并更新路线'
                              : '锁定酒店'}
                        </button>
                      </div>
                      {(lodgingByZone[zone.id] ?? []).length > 0 && (
                        <ul className="stay-zone__lodging-list" aria-label="片区酒店候选">
                          {(lodgingByZone[zone.id] ?? []).map((c) => {
                            const selected =
                              pickedLodging[zone.id]?.place_id === c.place_id ||
                              pickedLodging[zone.id]?.name === c.name;
                            return (
                              <li key={c.place_id || `${c.lat}-${c.lng}-${c.name}`}>
                                <button
                                  type="button"
                                  className={`stay-zone__lodging-item${
                                    selected ? ' stay-zone__lodging-item--selected' : ''
                                  }`}
                                  onClick={() => handlePickLodging(zone.id, c)}
                                >
                                  <span>{c.name}</span>
                                  <span className="stay-zone__lodging-meta">
                                    {c.distance_m}m
                                    {c.rating != null ? ` · ★${c.rating}` : ''}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {zone.purchase_url && (
                        <a
                          href={zone.purchase_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="stay-zone__link"
                        >
                          Trip.com 深链查价 →
                        </a>
                      )}
                    </div>
                  )}
                </article>
              ))}
          </div>
        </div>
      )}

      {confirmedZones.length > 0 && (
        <div className="stay-zone__confirmed-cta">
          <button
            type="button"
            className="form-btn form-btn--sm form-btn--primary"
            onClick={() => {
              setActiveView('map');
              setPreviewExpandedWithoutItinerary(true);
              const hotelNode = intel.hotels.find((h) => h.itinerary_node_id)?.itinerary_node_id;
              if (hotelNode) {
                usePlanStore.getState().selectNode(hotelNode);
                setLeftPanelMode('form');
              } else {
                setLeftPanelMode('stay');
              }
            }}
          >
            在地图查看并编辑
          </button>
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
  return (
    <div className="stay-zone__prefs">
      <p className="stay-zone__label">偏好（默认公共交通方便）</p>
      <FormRow>
        <label className="stay-zone__check">
          <input
            type="checkbox"
            checked={p.minimize_hotel_moves !== false}
            onChange={(e) => onChange({ ...p, minimize_hotel_moves: e.target.checked })}
          />
          少换酒店（折中片区）
        </label>
        <label className="stay-zone__check">
          <input
            type="checkbox"
            checked={p.safety_sensitive === true}
            onChange={(e) => onChange({ ...p, safety_sensitive: e.target.checked })}
          />
          安全敏感
        </label>
      </FormRow>
      <label className="stay-zone__budget">
        <span>每晚预算上限（可选）</span>
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
