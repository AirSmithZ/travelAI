import type { ItineraryEvidenceItem, ItineraryPoiCandidate } from '../../types/itinerary';
import './EvidencePanel.css';

interface EvidencePanelProps {
  items: ItineraryEvidenceItem[];
  poiCandidates?: ItineraryPoiCandidate[];
  /** From meta.evidence_status when pack is empty */
  status?: string | null;
  onClose?: () => void;
}

function emptyCopy(status?: string | null): string {
  if (status === 'unconfigured') {
    return '未配置公开笔记数据源。请在后端 .env 设置 TIKHUB_API_KEY（和/或 TAVILY_API_KEY）后重新生成。';
  }
  if (status === 'empty') {
    return '已配置数据源，但本次未检索到可用印证链接（上游无结果或过滤后为空）。';
  }
  if (!status) {
    return '用法：确认机酒后点「生成玩法」，系统会检索公开笔记/网页摘要作为参考（非官方）。生成完成后链接会出现在此面板。';
  }
  return '本次生成未附带印证链接（可能上游未返回或未配置）。';
}

function sourceLabel(source?: string): string {
  const s = (source || '').toLowerCase();
  if (s.includes('tikhub') || s.includes('xiaohongshu') || s.includes('xhs')) {
    return '公开笔记';
  }
  if (s.includes('tavily')) return '网页摘要';
  return source?.trim() || '参考来源';
}

/** UX-EVD-01: 非官方免责 + 已核验 / 仅网友 */
export function EvidencePanel({
  items,
  poiCandidates = [],
  status = null,
  onClose,
}: EvidencePanelProps) {
  const verifiedCount = items.filter((i) => i.verified).length;
  const factPois = poiCandidates.filter(
    (p) =>
      p.verified &&
      (p.rating != null || p.place_types?.length || p.hours_text || p.open_state),
  );

  return (
    <section className="evidence-panel" aria-label="参考依据">
      <header className="evidence-panel__head">
        <div>
          <h2 className="evidence-panel__title">玩法印证</h2>
          <p className="evidence-panel__sub">
            非官方参考 · 生成玩法时自动检索的公开笔记/网页摘要，用于提高行程可行性；请自行打开链接核对
          </p>
          {items.length > 0 && (
            <p className="evidence-panel__tally">
              共 {items.length} 条
              {verifiedCount > 0
                ? ` · ${verifiedCount} 条含围栏内已定位地点`
                : ' · 均为网友提及·未核验坐标'}
            </p>
          )}
        </div>
        {onClose && (
          <button type="button" className="evidence-panel__close" onClick={onClose}>
            关闭
          </button>
        )}
      </header>

      {factPois.length > 0 && (
        <ul className="evidence-panel__poi-list" aria-label="已核验地点">
          {factPois.slice(0, 8).map((p) => (
            <li key={p.place_id || p.name} className="evidence-panel__poi">
              <span className="evidence-panel__poi-name">{p.display_name || p.name}</span>
              {p.rating != null && (
                <span className="evidence-panel__poi-rating">{p.rating.toFixed(1)}★</span>
              )}
              {p.place_types?.[0] && (
                <span className="evidence-panel__poi-type">{p.place_types[0]}</span>
              )}
              {(p.open_state || p.hours_text) && (
                <span className="evidence-panel__poi-hours" title={p.hours_text || undefined}>
                  {p.open_state || p.hours_text}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <p className="evidence-panel__empty" role="status">
          {emptyCopy(status)}
        </p>
      ) : (
        <ul className="evidence-panel__list">
          {items.map((item, i) => {
            const key = item.note_id || item.url || `${item.title}-${i}`;
            const hasUrl = Boolean(item.url?.trim());
            const verified = Boolean(item.verified);
            return (
              <li key={key} className="evidence-panel__item">
                <div className="evidence-panel__item-meta">
                  <span className="evidence-panel__badge">{sourceLabel(item.source)}</span>
                  <span
                    className={
                      verified
                        ? 'evidence-panel__verify evidence-panel__verify--ok'
                        : 'evidence-panel__verify'
                    }
                  >
                    {verified ? '含已定位地点' : '仅网友提及'}
                  </span>
                  {typeof item.likes === 'number' && item.likes > 0 && (
                    <span className="evidence-panel__likes">{item.likes} 赞</span>
                  )}
                </div>
                {hasUrl ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="evidence-panel__link"
                  >
                    {item.title || item.url}
                  </a>
                ) : (
                  <span className="evidence-panel__title-plain">{item.title || '无标题'}</span>
                )}
                {item.snippet && <p className="evidence-panel__snippet">{item.snippet}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
