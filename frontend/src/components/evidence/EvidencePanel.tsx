import { useState } from 'react';
import type { ItineraryEvidenceItem, ItineraryPoiCandidate } from '../../types/itinerary';
import type { EvidenceLinkModule } from '../../types/travelPlan';
import { usePlanStore } from '../../stores/usePlanStore';
import './EvidencePanel.css';

/** Stable empty snapshot — avoid `?? []` in zustand selectors (infinite loop). */
const EMPTY_EVIDENCE_MODULES: EvidenceLinkModule[] = [];

interface EvidencePanelProps {
  items: ItineraryEvidenceItem[];
  poiCandidates?: ItineraryPoiCandidate[];
  /** From meta.evidence_status when pack is empty */
  status?: string | null;
  onClose?: () => void;
}

function sourceLabel(source?: string): string {
  const s = (source || '').toLowerCase();
  if (s.includes('user_paste')) return '用户指定';
  if (s.includes('tikhub') || s.includes('xiaohongshu') || s.includes('xhs')) {
    return '公开笔记';
  }
  if (s.includes('tavily')) return '网页摘要';
  return source?.trim() || '参考来源';
}

function moduleStatusLabel(status: EvidenceLinkModule['status']): string {
  if (status === 'loading') return '检索中…';
  if (status === 'ok') return '已检索';
  if (status === 'error') return '失败';
  return '待检索';
}

function previewText(text: string, max = 96): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function EvidenceDetailBody({
  item,
  expanded,
  onToggle,
}: {
  item: ItineraryEvidenceItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const body = (item.snippet || '').trim();
  const hasBody = body.length > 0;

  return (
    <div className="evidence-detail">
      <div className="evidence-panel__item-meta">
        <span className="evidence-panel__badge">{sourceLabel(item.source)}</span>
        {item.author && <span className="evidence-panel__author">@{item.author}</span>}
        {typeof item.likes === 'number' && item.likes > 0 && (
          <span className="evidence-panel__likes">{item.likes} 赞</span>
        )}
        {typeof item.comments_count === 'number' && item.comments_count > 0 && (
          <span className="evidence-panel__likes">{item.comments_count} 评</span>
        )}
        {typeof item.collected_count === 'number' && item.collected_count > 0 && (
          <span className="evidence-panel__likes">{item.collected_count} 藏</span>
        )}
        {item.verified && (
          <span className="evidence-panel__verify evidence-panel__verify--ok">含已定位地点</span>
        )}
      </div>

      {item.url ? (
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

      {(item.note_id || item.query || item.note_type || item.poi_hits?.length) && (
        <dl className="evidence-detail__meta">
          {item.note_id && (
            <>
              <dt>note_id</dt>
              <dd>{item.note_id}</dd>
            </>
          )}
          {item.note_type && (
            <>
              <dt>类型</dt>
              <dd>{item.note_type}</dd>
            </>
          )}
          {item.query && (
            <>
              <dt>检索词</dt>
              <dd>{item.query}</dd>
            </>
          )}
          {item.poi_hits && item.poi_hits.length > 0 && (
            <>
              <dt>提及地点</dt>
              <dd>{item.poi_hits.join(' · ')}</dd>
            </>
          )}
        </dl>
      )}

      {hasBody && (
        <div className="evidence-detail__body">
          <button
            type="button"
            className="evidence-detail__toggle"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? '收起正文' : '展开正文'}
            <span className="evidence-detail__toggle-hint">
              {expanded ? '' : previewText(body)}
            </span>
          </button>
          {expanded ? (
            <pre className="evidence-detail__full">{body}</pre>
          ) : (
            <p className="evidence-detail__preview">{previewText(body, 140)}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** UX-EVD-01 + doc 23: 贴链模块 + 生成后自动印证 */
export function EvidencePanel({
  items,
  poiCandidates = [],
  status = null,
  onClose,
}: EvidencePanelProps) {
  const modules = usePlanStore((s) => {
    const plan = s.plans.find((p) => p.id === s.activePlanId);
    return plan?.evidence_link_modules ?? EMPTY_EVIDENCE_MODULES;
  });
  const addEvidenceLink = usePlanStore((s) => s.addEvidenceLink);
  const removeEvidenceLink = usePlanStore((s) => s.removeEvidenceLink);
  const updateEvidenceLinkUrl = usePlanStore((s) => s.updateEvidenceLinkUrl);
  const fetchEvidenceLink = usePlanStore((s) => s.fetchEvidenceLink);

  const [draftUrl, setDraftUrl] = useState('');
  /** moduleId / auto-index → expanded */
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const verifiedCount = items.filter((i) => i.verified).length;
  const factPois = poiCandidates.filter(
    (p) =>
      p.verified &&
      (p.rating != null || p.place_types?.length || p.hours_text || p.open_state),
  );
  const okModules = modules.filter((m) => m.status === 'ok').length;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const onAdd = () => {
    const url = draftUrl.trim();
    const id = addEvidenceLink(url);
    if (id) setDraftUrl('');
  };

  return (
    <section className="evidence-panel" aria-label="参考依据">
      <header className="evidence-panel__head">
        <div>
          <h2 className="evidence-panel__title">玩法印证</h2>
          <p className="evidence-panel__sub">
            粘贴链接后检索笔记正文；列表默认折叠，可展开查看全文。生成时注入正文（有截断控费），机酒硬约束仍优先
          </p>
          {(modules.length > 0 || items.length > 0) && (
            <p className="evidence-panel__tally">
              用户链接 {modules.length} 条
              {okModules > 0 ? ` · ${okModules} 条已检索` : ''}
              {items.length > 0
                ? ` · 生成附带 ${items.length} 条${
                    verifiedCount > 0 ? `（${verifiedCount} 含已定位）` : ''
                  }`
                : ''}
            </p>
          )}
        </div>
        {onClose && (
          <button type="button" className="evidence-panel__close" onClick={onClose}>
            关闭
          </button>
        )}
      </header>

      <div className="evidence-panel__compose">
        <input
          type="url"
          className="evidence-panel__compose-input"
          placeholder="粘贴小红书链接（支持短链）"
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          aria-label="印证链接"
        />
        <button type="button" className="evidence-panel__compose-add" onClick={onAdd}>
          添加
        </button>
      </div>

      <div className="evidence-panel__modules" aria-label="用户指定链接">
        {modules.length === 0 ? (
          <p className="evidence-panel__hint">
            添加 1～5 条链接；每条独立检索与折叠。未检索的链接不会进入生成。
          </p>
        ) : (
          modules.map((mod, index) => {
            const expandKey = `mod:${mod.id}`;
            const expanded = Boolean(expandedIds[expandKey]);
            return (
              <article key={mod.id} className="evidence-module" data-status={mod.status}>
                <header className="evidence-module__head">
                  <span className="evidence-module__index">链接 {index + 1}</span>
                  <span className="evidence-module__status">{moduleStatusLabel(mod.status)}</span>
                  {mod.status === 'ok' && mod.result && (
                    <button
                      type="button"
                      className="evidence-module__fold"
                      aria-expanded={expanded}
                      onClick={() => toggleExpanded(expandKey)}
                    >
                      {expanded ? '收起' : '展开'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="evidence-module__remove"
                    onClick={() => removeEvidenceLink(mod.id)}
                    aria-label="移除链接"
                  >
                    ×
                  </button>
                </header>
                <div className="evidence-module__row">
                  <input
                    type="url"
                    className="evidence-module__url"
                    value={mod.url}
                    disabled={mod.status === 'loading'}
                    onChange={(e) => updateEvidenceLinkUrl(mod.id, e.target.value)}
                    placeholder="https://…"
                    aria-label={`链接 ${index + 1} 地址`}
                  />
                  <button
                    type="button"
                    className="evidence-module__fetch"
                    disabled={mod.status === 'loading' || !mod.url.trim()}
                    onClick={() => void fetchEvidenceLink(mod.id)}
                  >
                    {mod.status === 'loading' ? '检索中' : '检索'}
                  </button>
                </div>
                {mod.status === 'error' && mod.error && (
                  <p className="evidence-module__error" role="alert">
                    {mod.error}
                  </p>
                )}
                {mod.status === 'ok' && mod.result && (
                  <div className="evidence-module__result">
                    <EvidenceDetailBody
                      item={mod.result}
                      expanded={expanded}
                      onToggle={() => toggleExpanded(expandKey)}
                    />
                  </div>
                )}
                {mod.status === 'idle' && (
                  <p className="evidence-module__idle">粘贴后点「检索」拉取笔记正文</p>
                )}
              </article>
            );
          })
        )}
      </div>

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

      {items.length > 0 && (
        <div className="evidence-panel__auto">
          <h3 className="evidence-panel__auto-title">生成时附带参考</h3>
          <ul className="evidence-panel__list">
            {items.map((item, i) => {
              const key = item.note_id || item.url || `${item.title}-${i}`;
              const expandKey = `auto:${key}`;
              const expanded = Boolean(expandedIds[expandKey]);
              return (
                <li key={key} className="evidence-panel__item">
                  <EvidenceDetailBody
                    item={item}
                    expanded={expanded}
                    onToggle={() => toggleExpanded(expandKey)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {modules.length === 0 && items.length === 0 && status === 'unconfigured' && (
        <p className="evidence-panel__empty" role="status">
          未配置公开笔记数据源。请在后端 .env 设置 TIKHUB_API_KEY 后使用检索。
        </p>
      )}
    </section>
  );
}
