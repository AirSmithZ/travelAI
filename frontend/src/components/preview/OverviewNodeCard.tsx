import { CATEGORY_META } from '../../data/categoryTokens';
import type { ItineraryNode } from '../../types/itinerary';
import { formatNodeCost } from '../../utils/formatNodeCost';
import '../graph/TripNode.css';

interface OverviewNodeCardProps {
  node: ItineraryNode;
  selected: boolean;
  compact?: boolean;
  /** B-P6-02 */
  primaryHotel?: boolean;
  onSelect: () => void;
  onOpenMap: () => void;
}

export function OverviewNodeCard({
  node,
  selected,
  compact,
  primaryHotel,
  onSelect,
  onOpenMap,
}: OverviewNodeCardProps) {
  const meta = CATEGORY_META[node.category];
  const timeLabel =
    node.start_time && node.end_time
      ? `${node.start_time} – ${node.end_time}`
      : node.start_time ?? '';
  const costLabel = formatNodeCost(node);

  return (
    <button
      type="button"
      data-overview-node={node.id}
      className={`trip-node overview-trip-node ${compact ? 'trip-node--compact' : ''} ${node.is_optional ? 'trip-node--optional' : ''} ${selected ? 'trip-node--selected' : ''}${primaryHotel ? ' overview-trip-node--primary-hotel' : ''}`}
      style={
        {
          '--node-color': meta.color,
          '--node-glow': meta.glow,
        } as React.CSSProperties
      }
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
        <span className="trip-node__category">{meta.label}</span>
        {node.floor && <span className="trip-node__floor">{node.floor}</span>}
      </div>
      <div className="trip-node__name">{node.name}</div>
      {timeLabel && <div className="trip-node__time">{timeLabel}</div>}
      {costLabel && <div className="trip-node__cost">{costLabel}</div>}
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
