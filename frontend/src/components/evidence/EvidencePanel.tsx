import type { ItineraryEvidenceItem } from '../../types/itinerary';
import './EvidencePanel.css';

interface EvidencePanelProps {
  items: ItineraryEvidenceItem[];
  onClose?: () => void;
}

function sourceLabel(source?: string): string {
  const s = (source || '').toLowerCase();
  if (s.includes('tikhub') || s.includes('xiaohongshu') || s.includes('xhs')) {
    return '公开笔记';
  }
  if (s.includes('tavily')) return '网页摘要';
  return source?.trim() || '参考来源';
}

export function EvidencePanel({ items, onClose }: EvidencePanelProps) {
  return (
    <section className="evidence-panel" aria-label="参考依据">
      <header className="evidence-panel__head">
        <div>
          <h2 className="evidence-panel__title">参考依据</h2>
          <p className="evidence-panel__sub">
            生成时参考的公开笔记摘要，非票价；链接自行打开核对
          </p>
        </div>
        {onClose && (
          <button type="button" className="evidence-panel__close" onClick={onClose}>
            关闭
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <p className="evidence-panel__empty">本次生成未附带印证链接（可能上游未返回或未配置）</p>
      ) : (
        <ul className="evidence-panel__list">
          {items.map((item, i) => {
            const key = item.note_id || item.url || `${item.title}-${i}`;
            const hasUrl = Boolean(item.url?.trim());
            return (
              <li key={key} className="evidence-panel__item">
                <div className="evidence-panel__item-meta">
                  <span className="evidence-panel__badge">{sourceLabel(item.source)}</span>
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
