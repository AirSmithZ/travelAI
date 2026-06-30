import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { TRANSPORT_ICONS } from '../../data/categoryTokens';
import type { ItineraryEdge } from '../../types/itinerary';
import '../graph/TripEdge.css';

export type CrossDayEdgeData = {
  edge: ItineraryEdge;
};

function CrossDayEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps & { data: CrossDayEdgeData }) {
  const edge = data.edge;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.45,
  });

  const icon = TRANSPORT_ICONS[edge.transport_mode];

  return (
    <>
      <BaseEdge id={id} path={path} className="trip-edge trip-edge--cross-day" />
      <EdgeLabelRenderer>
        <div
          className="trip-edge__label trip-edge__label--cross-day"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <span className="trip-edge__icon">{icon}</span>
          <span>{edge.label ?? '跨日'}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const CrossDayEdge = memo(CrossDayEdgeComponent);
