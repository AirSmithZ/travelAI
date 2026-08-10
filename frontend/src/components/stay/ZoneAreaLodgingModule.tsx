import { useState } from 'react';
import {
  searchStayZoneLodging,
  type StayZoneLodgingCandidate,
} from '../../api/stayZones';
import {
  formatLodgingCacheAge,
  getLodgingSearchCache,
  lodgingPersistCacheKey,
  setLodgingSearchCache,
} from '../../utils/lodgingSearchCache';
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
 * P120: localStorage cache by hub+radius (survives refresh).
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
  const [cacheHint, setCacheHint] = useState<string | null>(null);

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
    setCacheHint(null);
    setAttempted(true);
    onDraftChange(null);
    onActivateMap();
    const radius = zone.geometry.radius_m ?? 1200;
    const key = lodgingPersistCacheKey({
      lat: zone.geometry.center.lat,
      lng: zone.geometry.center.lng,
      radiusM: radius,
      city: zone.city,
    });
    try {
      if (!forceRefresh) {
        const cached = getLodgingSearchCache(key);
        if (cached && cached.value.candidates.length > 0) {
          setItems(cached.value.candidates);
          onResultsChange(cached.value.candidates);
          setCacheHint(`缓存命中（${formatLodgingCacheAge(cached.fetchedAt)}）· 可重新检索`);
          return;
        }
      }

      const res = await searchStayZoneLodging({
        zone_id: zone.id,
        city: zone.city,
        label: zone.label,
        lat: zone.geometry.center.lat,
        lng: zone.geometry.center.lng,
        radius_m: radius,
      });

      if (res.candidates.length > 0) {
        setLodgingSearchCache(key, {
          candidates: res.candidates,
          warnings: res.warnings,
          query: res.query,
        });
        setItems(res.candidates);
        onResultsChange(res.candidates);
        return;
      }

      // 429 / provider error: fall back to stale LS if present (better than empty)
      if (res.status === 'rate_limited' || res.status === 'provider_error') {
        const stale = getLodgingSearchCache(key);
        if (stale && stale.value.candidates.length > 0) {
          setItems(stale.value.candidates);
          onResultsChange(stale.value.candidates);
          setCacheHint(
            `上游暂不可用，已显示缓存（${formatLodgingCacheAge(stale.fetchedAt)}）`,
          );
          setLocalError(res.warnings[0] ?? null);
          return;
        }
      }

      setItems([]);
      onResultsChange([]);
      if (res.status === 'rate_limited') {
        setLocalError(
          res.warnings[0] ?? '地图检索限流，请稍等再点「重新检索」（不是附近没酒店）',
        );
      } else if (res.status === 'provider_error' || res.status === 'unconfigured') {
        setLocalError(res.warnings[0] ?? '片区酒店检索失败，请稍后重试');
      } else {
        setLocalError(res.warnings[0] ?? '片区附近暂无候选');
      }
    } catch (e) {
      const stale = getLodgingSearchCache(key);
      if (stale && stale.value.candidates.length > 0) {
        setItems(stale.value.candidates);
        onResultsChange(stale.value.candidates);
        setCacheHint(
          `请求失败，已显示缓存（${formatLodgingCacheAge(stale.fetchedAt)}）`,
        );
        setLocalError(e instanceof Error ? e.message : '片区酒店检索失败');
      } else {
        setItems([]);
        onResultsChange([]);
        setLocalError(e instanceof Error ? e.message : '片区酒店检索失败');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stay-zone__module" aria-label="片区附近酒店">
      <header className="stay-zone__module-head">
        <div>
          <h5 className="stay-zone__module-title">片区附近</h5>
          <p className="stay-zone__module-desc">
            仅当前选中片区的候选会上图；与顶层「店名搜索」互不干扰。同圆心结果会写入本地缓存，刷新后可复用。
          </p>
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

      {cacheHint ? <p className="stay-zone__cache-hint">{cacheHint}</p> : null}

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
          <p className="stay-zone__empty-lodging-title">
            {localError?.includes('限流') || localError?.includes('连接中断')
              ? '检索暂时不可用'
              : '片区附近暂无候选'}
          </p>
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
