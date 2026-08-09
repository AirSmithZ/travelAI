import type { ItineraryNode } from '../../types/itinerary';
import { OverviewNodeCard } from './OverviewNodeCard';
import './OverviewDragGhost.css';

interface OverviewDragGhostProps {
  node: ItineraryNode;
  left: number;
  top: number;
  width: number;
  height: number;
  compact?: boolean;
}

export function OverviewDragGhost({
  node,
  left,
  top,
  width,
  height,
  compact,
}: OverviewDragGhostProps) {
  return (
    <div
      className="overview-drag-ghost"
      style={{ left, top, width, height }}
      aria-hidden
    >
      <OverviewNodeCard
        node={node}
        compact={compact}
        selected
        omitAnchor
        onSelect={() => {}}
        onOpenMap={() => {}}
      />
    </div>
  );
}
