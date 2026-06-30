import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { TRANSPORT_ICONS } from '../../data/categoryTokens';
import type { ItineraryEdge } from '../../types/itinerary';
import './TripEdge.css';

export type TripEdgeData = {
  edge: ItineraryEdge;
};

function TripEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps & { data: TripEdgeData }) {
  const edge = data.edge;
  const isAlt = edge.type === 'alternative';

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const icon = TRANSPORT_ICONS[edge.transport_mode];

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`trip-edge ${isAlt ? 'trip-edge--alt' : ''} ${selected ? 'trip-edge--selected' : ''}`}
      />
      <EdgeLabelRenderer>
        <div
          className={`trip-edge__label ${isAlt ? 'trip-edge__label--alt' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <span className="trip-edge__icon">{icon}</span>
          <span>{edge.duration_minutes} 分钟</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const TripEdge = memo(TripEdgeComponent);
