import { CATEGORY_META } from '../../data/categoryTokens';
import type { ItineraryNode } from '../../types/itinerary';
import { formatNodeCost } from '../../utils/formatNodeCost';
import '../graph/TripNode.css';

interface OverviewNodeCardProps {
  node: ItineraryNode;
  selected: boolean;
  compact?: boolean;
  /** html-to-image 导出：实色边框/背景，避免 color-mix / 动画错乱 */
  exportMode?: boolean;
  /** B-P6-02 */
  primaryHotel?: boolean;
  /** Drag ghost must not register as a layout anchor (duplicate id). */
  omitAnchor?: boolean;
  onSelect: () => void;
  onOpenMap: () => void;
}

/** #RRGGBB + alpha 0–1 → rgba()（foreignObject 不吃 color-mix） */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function OverviewNodeCard({
  node,
  selected,
  compact,
  exportMode,
  primaryHotel,
  omitAnchor,
  onSelect,
  onOpenMap,
}: OverviewNodeCardProps) {
  const meta = CATEGORY_META[node.category];
  const timeLabel =
    node.start_time && node.end_time
      ? `${node.start_time} – ${node.end_time}`
      : node.start_time ?? '';
  const costLabel = formatNodeCost(node);

  const exportStyle = exportMode
    ? ({
        '--node-color': meta.color,
        '--node-glow': 'transparent',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        appearance: 'none',
        WebkitAppearance: 'none',
        textAlign: 'left',
        fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif',
        color: '#e8edf4',
        background: 'linear-gradient(145deg, #182230 0%, #131b24 100%)',
        border: `1.5px solid ${hexToRgba(meta.color, 0.55)}`,
        borderRadius: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        padding: compact ? '6px 8px' : '10px 12px',
        width: '100%',
        minHeight: compact ? '64px' : '88px',
        transform: 'none',
        animation: 'none',
        transition: 'none',
        opacity: node.is_optional ? 0.82 : 1,
        overflow: 'hidden',
      } as React.CSSProperties)
    : ({
        '--node-color': meta.color,
        '--node-glow': meta.glow,
      } as React.CSSProperties);

  return (
    <button
      type="button"
      data-overview-node={omitAnchor ? undefined : node.id}
      className={`trip-node overview-trip-node ${compact ? 'trip-node--compact' : ''} ${node.is_optional ? 'trip-node--optional' : ''} ${selected && !exportMode ? 'trip-node--selected' : ''}${primaryHotel ? ' overview-trip-node--primary-hotel' : ''}${exportMode ? ' trip-node--export' : ''}`}
      style={exportStyle}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenMap();
      }}
    >
      <div className="trip-node__header">
        <span className="trip-node__icon">{meta.icon}</span>
        <span className="trip-node__category" style={exportMode ? { color: meta.color } : undefined}>
          {meta.label}
        </span>
        {node.floor && <span className="trip-node__floor">{node.floor}</span>}
      </div>
      <div className="trip-node__name">{node.name}</div>
      {timeLabel && <div className="trip-node__time">{timeLabel}</div>}
      {costLabel && (
        <div
          className="trip-node__cost"
          style={exportMode ? { color: '#d4a017' } : undefined}
        >
          {costLabel}
        </div>
      )}
      {!compact && node.tags && node.tags.length > 0 && (
        <div className="trip-node__tags">
          {node.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="trip-node__tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      {!compact && node.tips && node.tips.length > 0 && (
        <div className="trip-node__desc" title={node.tips.join('\n')}>
          {node.tips.join(' · ')}
        </div>
      )}
    </button>
  );
}
