import { useState } from 'react';
import {
  searchStayZoneLodging,
  type StayZoneLodgingCandidate,
} from '../../api/stayZones';
import {
  LODGING_CACHE_TTL_MS,
  cacheGet,
  cacheInvalidate,
  cacheSet,
  lodgingCacheKey,
} from '../../utils/searchResultCache';
import type { RecommendedStayZone } from '../../types/stayZone';
import { HotelCandidateList } from './HotelCandidateList';
import type { ZoneHotelCandidate } from './zoneHotelShared';

type Props = {
  zone: RecommendedStayZone;
  draft: ZoneHotelCandidate | null;
  lockedName?: string | null;
  locking: boolean;
  onDraftChange: (c: ZoneHotelCandidate | null) => void;
  onResultsChange: (items: ZoneHotelCandidate[]) => void;
  onActivateMap: () => void;
  onLock: (c: ZoneHotelCandidate) => void;
};

/**
 * Per-zone module: search lodging near zone hub.
 * Map pins for this list only show when the zone is selected.
 */
export function ZoneAreaLodgingModule({
  zone,
  draft,
  lockedName,
  locking,
  onDraftChange,
  onResultsChange,
  onActivateMap,
  onLock,
}: Props) {
  const [items, setItems] = useState<StayZoneLodgingCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canLock =
    Boolean(draft) &&
    Number.isFinite(draft!.lat) &&
    Number.isFinite(draft!.lng);

  async function search(forceRefresh = false) {
    if (!zone.geometry || zone.geometry.type !== 'circle') {
      setLocalError('该片区无圆心坐标，无法检索附近酒店');
      setAttempted(true);
      return;
    }
    setLoading(true);
    setLocalError(null);
    setAttempted(true);
    onDraftChange(null);
    onActivateMap();
    const radius = zone.geometry.radius_m ?? 1200;
    const key = lodgingCacheKey({
      zoneId: zone.id,
      lat: zone.geometry.center.lat,
      lng: zone.geometry.center.lng,
      radiusM: radius,
    });
    try {
      const cached = forceRefresh
        ? null
        : cacheGet<{ candidates: StayZoneLodgingCandidate[]; warnings: string[] }>(
            'lodging',
            key,
            LODGING_CACHE_TTL_MS,
          );
      if (cached && cached.value.candidates.length > 0) {
        setItems(cached.value.candidates);
        onResultsChange(cached.value.candidates);
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
      setItems(res.candidates);
      onResultsChange(res.candidates);
      if (res.candidates.length === 0) {
        setLocalError(res.warnings[0] ?? '片区附近暂无候选');
      }
    } catch (e) {
      setItems([]);
      onResultsChange([]);
      setLocalError(e instanceof Error ? e.message : '片区酒店检索失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stay-zone__module" aria-label="片区附近酒店">
      <header className="stay-zone__module-head">
        <div>
          <h5 className="stay-zone__module-title">片区附近</h5>
          <p className="stay-zone__module-desc">仅当前选中片区的候选会上图；与顶层「店名搜索」互不干扰</p>
        </div>
        <div className="stay-zone__module-actions">
          <button
            type="button"
            className="form-btn form-btn--sm"
            disabled={loading}
            onClick={() => void search(items.length > 0)}
          >
            {loading ? '检索中…' : items.length ? '重新检索' : '搜索片区酒店'}
          </button>
        </div>
      </header>

      {lockedName ? (
        <p className="stay-zone__shared-lock">当前锁定：{lockedName}</p>
      ) : null}

      {loading ? (
        <p className="stay-zone__meta">正在检索片区酒店…</p>
      ) : items.length > 0 ? (
        <HotelCandidateList
          items={items}
          selected={draft}
          ariaLabel="片区酒店候选"
          onSelect={(c) => {
            onDraftChange(c);
            onActivateMap();
          }}
        />
      ) : attempted ? (
        <div className="stay-zone__empty-lodging" role="status">
          <p className="stay-zone__empty-lodging-title">片区附近暂无候选</p>
          <p className="stay-zone__empty-lodging-body">
            {localError ?? '可改用上方「店名搜索」，两个入口互不影响。'}
          </p>
        </div>
      ) : (
        <p className="stay-zone__idle-hint">点击「搜索片区酒店」拉取附近候选</p>
      )}

      <div className="stay-zone__module-lock">
        <button
          type="button"
          className="form-btn form-btn--sm form-btn--primary"
          disabled={locking || !canLock}
          onClick={() => draft && onLock(draft)}
        >
          {locking ? '锁定中…' : '锁定此酒店'}
        </button>
      </div>
    </section>
  );
}
