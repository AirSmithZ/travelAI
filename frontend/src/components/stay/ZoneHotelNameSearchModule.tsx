import { useEffect, useState } from 'react';
import { geocodeAutocomplete } from '../../api/geocode';
import { useToastStore } from '../../stores/useToastStore';
import { FormField, FormInput } from '../ui/FormField';
import { HotelCandidateList } from './HotelCandidateList';
import {
  geocodeHitToCandidate,
  type ZoneHotelCandidate,
} from './zoneHotelShared';

type Props = {
  /** City / destination bias for geocode (not a zone bind). */
  destination: string;
  draft: ZoneHotelCandidate | null;
  lockedName?: string | null;
  locking: boolean;
  /** doc 36: prefill when user clicks a locked map pin to replace */
  seedQuery?: string | null;
  onDraftChange: (c: ZoneHotelCandidate | null) => void;
  onResultsChange: (items: ZoneHotelCandidate[]) => void;
  onActivateMap: () => void;
  onLock: (c: ZoneHotelCandidate) => void;
};

/**
 * P112: Top-level module — search hotel by name (autocomplete).
 * Mounted above「推荐片区」; lock writes travel_intel without zone_id.
 */
export function ZoneHotelNameSearchModule({
  destination,
  draft,
  lockedName,
  locking,
  seedQuery = null,
  onDraftChange,
  onResultsChange,
  onActivateMap,
  onLock,
}: Props) {
  const showToast = useToastStore((s) => s.show);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ZoneHotelCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!seedQuery?.trim()) return;
    // StayZonePanel may append ·nonce to force refresh
    const q = seedQuery.includes('·') ? seedQuery.slice(0, seedQuery.lastIndexOf('·')) : seedQuery;
    setQuery(q.trim());
  }, [seedQuery]);

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

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      showToast('请先输入至少 2 个字符的酒店名', 'warning');
      return;
    }
    setLoading(true);
    setAttempted(true);
    onDraftChange(null);
    onActivateMap();
    try {
      const geo = await geocodeAutocomplete(q, destination || '');
      const hits = (geo.results ?? [])
        .map((r) => geocodeHitToCandidate(r, null))
        .filter((x): x is ZoneHotelCandidate => x != null);
      setItems(hits);
      onResultsChange(hits);
      if (hits.length === 0) {
        showToast(geo.warnings?.[0] ?? '未找到匹配酒店', 'warning');
      } else if (hits.length === 1) {
        onDraftChange(hits[0]);
        setQuery(hits[0].name);
      } else {
        showToast(`找到 ${hits.length} 家，请点选后再锁定`, 'info');
      }
    } catch (e) {
      setItems([]);
      onResultsChange([]);
      showToast(e instanceof Error ? e.message : '酒店名搜索失败', 'warning');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stay-zone__module stay-zone__module--global" aria-label="按店名搜索酒店">
      <header className="stay-zone__module-head">
        <div>
          <h5 className="stay-zone__module-title">店名搜索</h5>
          <p className="stay-zone__module-desc">
            顶层独立入口；锁定不绑定片区；切换片区不会清空地图标记
          </p>
        </div>
      </header>

      {lockedName ? (
        <p className="stay-zone__shared-lock">当前锁定：{lockedName}</p>
      ) : null}

      <div className="stay-zone__name-row">
        <FormField label="酒店名称" className="stay-zone__name-field">
          <FormInput
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (draft && draft.name !== v) onDraftChange(null);
            }}
            placeholder="例如 lyf Funan Singapore"
          />
        </FormField>
        <button
          type="button"
          className="form-btn form-btn--sm form-btn--primary stay-zone__name-search-btn"
          disabled={loading || query.trim().length < 2}
          onClick={() => void search()}
        >
          {loading ? '搜索中…' : '搜索'}
        </button>
      </div>

      {loading ? (
        <p className="stay-zone__meta">正在按店名搜索…</p>
      ) : items.length > 0 ? (
        <HotelCandidateList
          items={items}
          selected={draft}
          showAddress
          ariaLabel="店名搜索候选"
          onSelect={(c) => {
            onDraftChange(c);
            setQuery(c.name);
            onActivateMap();
          }}
        />
      ) : attempted ? (
        <div className="stay-zone__empty-lodging" role="status">
          <p className="stay-zone__empty-lodging-title">未找到匹配酒店</p>
          <p className="stay-zone__empty-lodging-body">调整关键词后再次点击「搜索」。</p>
        </div>
      ) : (
        <p className="stay-zone__idle-hint">输入店名后点击「搜索」</p>
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
      </div>
    </section>
  );
}
