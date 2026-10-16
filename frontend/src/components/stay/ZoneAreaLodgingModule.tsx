import { useMemo, useState } from 'react';
import {
  searchStayZoneLodging,
  type StayZoneLodgingCandidate,
  type StayZoneLodgingMode,
} from '../../api/stayZones';
import {
  formatLodgingCacheAge,
  formatLodgingEmptyCooldown,
  getLodgingEmptyCache,
  getLodgingSearchCache,
  lodgingPersistCacheKey,
  setLodgingEmptyCache,
  setLodgingSearchCache,
} from '../../utils/lodgingSearchCache';
import { observeStayZone } from '../../utils/stayZoneObserve';
import type { RecommendedStayZone } from '../../types/stayZone';
import { HotelCandidateList } from './HotelCandidateList';
import type { ZoneHotelCandidate } from './zoneHotelShared';

type Props = {
  zone: RecommendedStayZone;
  draft: ZoneHotelCandidate | null;
  lockedName?: string | null;
  locking: boolean;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  rooms?: number | null;
  maxPrice?: number | null;
  onDraftChange: (c: ZoneHotelCandidate | null) => void;
  onResultsChange: (items: ZoneHotelCandidate[]) => void;
  onActivateMap: () => void;
  onLock: (c: ZoneHotelCandidate) => void;
};

/**
 * Per-zone lodging: RollingGo list+pins (HOT-RG-02) + Trip CTA.
 * HOT-TRIP-03: no geometry → no「附近搜店」narrative.
 * HOT-ZONE-CATALOG: lazy search only; empty miss uses short TTL cooldown.
 */
export function ZoneAreaLodgingModule({
  zone,
  draft,
  lockedName,
  locking,
  checkIn = '',
  checkOut = '',
  adults = 2,
  rooms = null,
  maxPrice = null,
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
  const [tripUrl, setTripUrl] = useState(zone.purchase_url || '');
  const [mode, setMode] = useState<StayZoneLodgingMode | null>(null);

  const hasGeometry = zone.geometry?.type === 'circle';
  const isCatalogZone = zone.id.startsWith('catalog:');

  const fallbackTripHref = useMemo(() => {
    if (tripUrl) return tripUrl;
    if (zone.purchase_url) return zone.purchase_url;
    return '';
  }, [tripUrl, zone.purchase_url]);

  const canLock =
    Boolean(draft) &&
    Number.isFinite(draft!.lat) &&
    Number.isFinite(draft!.lng);
  const lockLabel = lockedName
    ? locking
      ? '替换中…'
      : '替换为这家酒店'
    : locking
      ? '锁定中…'
      : '锁定此酒店';

  async function search(forceRefresh = false) {
    if (!hasGeometry || !zone.geometry || zone.geometry.type !== 'circle') {
      setLocalError('该片区尚无地图轮廓，无法做区域搜店上图；请用 Trip.com 或上方店名搜索');
      setAttempted(true);
      setMode('trip_first');
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
      checkIn: checkIn || zone.check_in,
      checkOut: checkOut || zone.check_out || zone.check_in,
      catalogId: isCatalogZone ? zone.id : undefined,
    });
    const observeBase = {
      zoneId: zone.id,
      city: zone.city,
      catalog: isCatalogZone,
    } as const;
    try {
      if (!forceRefresh) {
        const cached = getLodgingSearchCache(key);
        if (cached && cached.value.candidates.length > 0) {
          setItems(cached.value.candidates);
          onResultsChange(cached.value.candidates);
          setCacheHint(`缓存命中（${formatLodgingCacheAge(cached.fetchedAt)}）· 可重新检索`);
          setMode('rollinggo');
          observeStayZone({
            type: 'lodging_search',
            ...observeBase,
            outcome: 'cache_hit',
            count: cached.value.candidates.length,
          });
          return;
        }
        const emptyHit = getLodgingEmptyCache(key);
        if (emptyHit) {
          setItems([]);
          onResultsChange([]);
          setCacheHint(
            `刚搜过为空（冷却 ${formatLodgingEmptyCooldown(emptyHit.remainingMs)}）· 点「重新搜索」可强制再试`,
          );
          setLocalError(
            emptyHit.warnings?.[0] ??
              '短冷却内不重复请求上游；可换区、店名搜索，或强制重新搜索',
          );
          setMode('trip_first');
          observeStayZone({
            type: 'lodging_search',
            ...observeBase,
            outcome: 'empty_cooldown',
          });
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
        check_in: checkIn || zone.check_in,
        check_out: checkOut || zone.check_out || zone.check_in,
        adults,
        rooms: rooms ?? undefined,
        max_price: maxPrice ?? undefined,
      });

      if (res.trip_url) setTripUrl(res.trip_url);
      setMode(res.mode);

      if (res.candidates.length > 0) {
        setLodgingSearchCache(key, {
          candidates: res.candidates,
          warnings: res.warnings,
          query: res.query,
        });
        setItems(res.candidates);
        onResultsChange(res.candidates);
        if (res.warnings[0] && res.mode !== 'rollinggo') {
          setLocalError(res.warnings[0]);
        } else if (res.warnings[0]) {
          setCacheHint(res.warnings[0]);
        }
        observeStayZone({
          type: 'lodging_search',
          ...observeBase,
          outcome: 'ok',
          count: res.candidates.length,
        });
        return;
      }

      if (res.mode === 'trip_first' || res.status === 'trip_first') {
        const stale = getLodgingSearchCache(key);
        if (stale && stale.value.candidates.length > 0) {
          setItems(stale.value.candidates);
          onResultsChange(stale.value.candidates);
          setCacheHint(
            `上游暂不可用，已显示缓存（${formatLodgingCacheAge(stale.fetchedAt)}）`,
          );
          setLocalError(res.warnings[0] ?? '结构化搜店暂不可用，请优先打开 Trip.com');
          observeStayZone({
            type: 'lodging_search',
            ...observeBase,
            outcome: 'trip_first',
            count: stale.value.candidates.length,
          });
          return;
        }
        setLodgingEmptyCache(key, { warnings: res.warnings });
        setItems([]);
        onResultsChange([]);
        setLocalError(
          res.warnings[0] ?? '暂无带坐标候选；请打开 Trip.com 或店名搜索（不是附近没酒店）',
        );
        observeStayZone({
          type: 'lodging_search',
          ...observeBase,
          outcome: 'trip_first',
          count: 0,
        });
        return;
      }

      setLodgingEmptyCache(key, { warnings: res.warnings });
      setItems([]);
      onResultsChange([]);
      setLocalError(res.warnings[0] ?? '片区暂无候选；可打开 Trip.com 或改用店名搜索');
      observeStayZone({
        type: 'lodging_search',
        ...observeBase,
        outcome: 'empty',
        count: 0,
      });
    } catch (e) {
      setMode('trip_first');
      const stale = getLodgingSearchCache(key);
      if (stale && stale.value.candidates.length > 0) {
        setItems(stale.value.candidates);
        onResultsChange(stale.value.candidates);
        setCacheHint(
          `请求失败，已显示缓存（${formatLodgingCacheAge(stale.fetchedAt)}）`,
        );
        setLocalError(e instanceof Error ? e.message : '片区酒店检索失败');
      } else {
        setLodgingEmptyCache(key, {
          warnings: [e instanceof Error ? e.message : '片区酒店检索失败'],
        });
        setItems([]);
        onResultsChange([]);
        setLocalError(
          e instanceof Error
            ? `${e.message} · 请用 Trip.com 或店名搜索`
            : '片区酒店检索失败 · 请用 Trip.com',
        );
      }
      observeStayZone({
        type: 'lodging_search',
        ...observeBase,
        outcome: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  const sourceLabel =
    mode === 'rollinggo'
      ? 'RollingGo 参考价 · 可上图锁定'
      : mode === 'serp'
        ? '地图附近候选'
        : null;

  return (
    <section className="stay-zone__module" aria-label="片区订房">
      <header className="stay-zone__module-head">
        <div>
          <h5 className="stay-zone__module-title">片区订房</h5>
          <p className="stay-zone__module-desc">
            {hasGeometry
              ? '点「搜附近」才请求上游；空结果有短冷却，避免连点刷接口。Trip.com 仍可浏览下单。仅当前选中片区会上图。'
              : '该片区尚无地图轮廓：请用 Trip.com 或上方「店名搜索」，不提供区域搜店上图。'}
          </p>
        </div>
        <div className="stay-zone__module-actions">
          {hasGeometry ? (
            <button
              type="button"
              className="form-btn form-btn--sm form-btn--primary"
              disabled={loading}
              onClick={() => void search(attempted)}
            >
              {loading ? '检索中…' : attempted ? '重新搜索' : '搜附近'}
            </button>
          ) : null}
          {fallbackTripHref ? (
            <a
              href={fallbackTripHref}
              target="_blank"
              rel="noopener noreferrer"
              className="form-btn form-btn--sm"
            >
              Trip.com →
            </a>
          ) : null}
        </div>
      </header>

      {sourceLabel ? <p className="stay-zone__cache-hint">{sourceLabel}</p> : null}
      {cacheHint ? <p className="stay-zone__cache-hint">{cacheHint}</p> : null}

      {lockedName ? (
        <p className="stay-zone__shared-lock">当前锁定：{lockedName}</p>
      ) : null}

      {!hasGeometry ? (
        <div className="stay-zone__empty-lodging" role="status">
          <p className="stay-zone__empty-lodging-title">无片区轮廓</p>
          <p className="stay-zone__empty-lodging-body">
            无法做区域搜店上图。请打开 Trip.com，或用顶层店名搜索锁定酒店。
          </p>
        </div>
      ) : loading ? (
        <p className="stay-zone__meta">正在检索片区酒店…</p>
      ) : items.length > 0 ? (
        <>
          {localError ? (
            <p className="stay-zone__warning" role="status">
              {localError}
            </p>
          ) : null}
          <HotelCandidateList
            items={items}
            selected={draft}
            showAddress
            ariaLabel="片区酒店候选"
            onSelect={(c) => {
              onDraftChange(c);
              onActivateMap();
            }}
          />
        </>
      ) : attempted ? (
        <div className="stay-zone__empty-lodging" role="status">
          <p className="stay-zone__empty-lodging-title">
            {mode === 'trip_first' || localError?.includes('Trip')
              ? '请优先用 Trip.com'
              : '片区暂无候选'}
          </p>
          <p className="stay-zone__empty-lodging-body">
            {localError ?? '可打开 Trip.com，或改用上方「店名搜索」。'}
          </p>
          {fallbackTripHref ? (
            <p className="stay-zone__idle-hint">
              <a href={fallbackTripHref} target="_blank" rel="noopener noreferrer">
                打开 Trip.com 片区搜店 →
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="stay-zone__idle-hint">点击「搜附近」拉取候选并上图（不会自动请求）</p>
      )}

      <div className="stay-zone__module-lock">
        <button
          type="button"
          className="form-btn form-btn--sm form-btn--primary"
          disabled={locking || !canLock}
          onClick={() => draft && onLock(draft)}
        >
          {lockLabel}
        </button>
        {draft?.booking_url ? (
          <a
            href={draft.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="stay-zone__link"
          >
            RollingGo 预订页 →
          </a>
        ) : null}
      </div>
    </section>
  );
}
