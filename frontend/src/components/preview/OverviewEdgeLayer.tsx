import type { ItineraryEdge } from '../../types/itinerary';
import type { CellNodePlacement } from '../../utils/layoutOverview';
import { connectionBetweenPlacements } from '../../utils/overviewEdgeGeometry';
import { OverviewBezierEdge } from './OverviewBezierEdge';
import './OverviewEdgeLayer.css';

interface OverviewEdgeLayerProps {
  width: number;
  height: number;
  crossRegionEdges: ItineraryEdge[];
  placements: Map<string, CellNodePlacement>;
}

export function OverviewEdgeLayer({
  width,
  height,
  crossRegionEdges,
  placements,
}: OverviewEdgeLayerProps) {
  if (crossRegionEdges.length === 0) return null;

  return (
    <div
      className="overview-edge-layer"
      style={{ width, height }}
      aria-hidden
    >
      {crossRegionEdges.map((edge) => {
        const from = placements.get(edge.from);
        const to = placements.get(edge.to);
        if (!from || !to) return null;

        const { x1, y1, x2, y2, sourceSide, targetSide } = connectionBetweenPlacements(
          from,
          to,
          edge,
          null,
        );

        return (
          <OverviewBezierEdge
            key={edge.id}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            sourceSide={sourceSide}
            targetSide={targetSide}
            edge={edge}
            variant="region"
          />
        );
      })}
    </div>
  );
}
