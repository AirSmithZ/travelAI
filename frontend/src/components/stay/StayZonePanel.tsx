import { useMemo, useState } from 'react';
import { recommendStayZones } from '../../api/stayZones';
import { geocodeAutocomplete } from '../../api/geocode';
import { usePlanStore } from '../../stores/usePlanStore';
import type { StayZonePreferences } from '../../types/stayZone';
import {
  formatStayZoneDays,
  getStayZonePanelPhase,
  stayZonePanelBadgeLabel,
} from '../../types/stayZone';
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
  const startMapPick = usePlanStore((s) => s.startMapPick);
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const setActiveView = usePlanStore((s) => s.setActiveView);

  const zones = intel.recommended_stay_zones ?? [];
  const prefs = intel.stay_zone_preferences;
  const panelPhase = getStayZonePanelPhase(intel);
  const badgeLabel = stayZonePanelBadgeLabel(panelPhase);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [expandedAddId, setExpandedAddId] = useState<string | null>(null);
  const [hotelNames, setHotelNames] = useState<Record<string, string>>({});
  const [addLoading, setAddLoading] = useState<string | null>(null);

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

  async function handleAddHotel(zoneId: string) {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone || !itinerary) return;
    const name = (hotelNames[zoneId] ?? `${zone.label} 附近酒店`).trim();
    setAddLoading(zoneId);
    setError(null);
    try {
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
        const nodeId = addHotelFromZone(zoneId, {
          name,
          lat: zone.geometry?.type === 'circle' ? zone.geometry.center.lat : 0,
          lng: zone.geometry?.type === 'circle' ? zone.geometry.center.lng : 0,
          pendingMapPick: true,
        });
        if (nodeId) {
          startMapPick(nodeId);
          setActiveView('map');
          setLeftPanelMode('form');
        }
        return;
      }
      addHotelFromZone(zoneId, { name, lat, lng, address, coord_source: 'geocode' });
      setExpandedAddId(null);
      setLeftPanelMode('form');
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setAddLoading(null);
    }
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
                        onClick={() => setExpandedAddId(expandedAddId === zone.id ? null : zone.id)}
                      >
                        添加酒店到路线图
                      </button>
                    )}
                  </div>
                  {expandedAddId === zone.id && zone.status === 'confirmed' && (
                    <div className="stay-zone__add">
                      <FormField label="酒店名称">
                        <FormInput
                          value={hotelNames[zone.id] ?? `${zone.label} 附近酒店`}
                          onChange={(e) =>
                            setHotelNames((m) => ({ ...m, [zone.id]: e.target.value }))
                          }
                          placeholder="如：滨海湾金沙"
                        />
                      </FormField>
                      <p className="stay-zone__add-hint">
                        先搜索地址；搜不到将打开地图点选确认位置。
                      </p>
                      <button
                        type="button"
                        className="form-btn form-btn--sm form-btn--primary"
                        disabled={addLoading === zone.id}
                        onClick={() => void handleAddHotel(zone.id)}
                      >
                        {addLoading === zone.id ? '添加中…' : '确认添加'}
                      </button>
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
              setLeftPanelMode('form');
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
    </div>
  );
}
