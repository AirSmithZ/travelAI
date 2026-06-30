import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CATEGORY_META } from '../../data/categoryTokens';
import type { ItineraryNode } from '../../types/itinerary';
import { formatNodeCost } from '../../utils/formatNodeCost';
import './TripNode.css';

export type TripNodeData = {
  node: ItineraryNode;
  selected: boolean;
  compact?: boolean;
};

function TripNodeComponent({ data }: NodeProps & { data: TripNodeData }) {
  const { node, selected, compact } = data;
  const meta = CATEGORY_META[node.category];
  const timeLabel =
    node.start_time && node.end_time
      ? `${node.start_time} – ${node.end_time}`
      : node.start_time ?? '';
  const costLabel = formatNodeCost(node);

  return (
    <div
      className={`trip-node ${compact ? 'trip-node--compact' : ''} ${node.is_optional ? 'trip-node--optional' : ''} ${selected ? 'trip-node--selected' : ''}`}
      style={
        {
          '--node-color': meta.color,
          '--node-glow': meta.glow,
        } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} className="trip-node__handle" />
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
      <Handle type="source" position={Position.Right} className="trip-node__handle" />
    </div>
  );
}

export const TripNode = memo(TripNodeComponent);
