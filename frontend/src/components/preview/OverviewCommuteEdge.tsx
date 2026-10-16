import type { ItineraryEdge } from '../../types/itinerary';
import { TRANSPORT_ICONS } from '../../data/categoryTokens';
import {
  formatCommuteEdgeLabel,
  formatCommuteEdgeTitle,
} from '../../utils/commuteLabels';
import '../graph/TripEdge.css';
import './OverviewCommuteEdge.css';

interface OverviewCommuteEdgeProps {
  edge: ItineraryEdge;
  compact?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

export function OverviewCommuteEdge({
  edge,
  compact,
  selected,
  onSelect,
}: OverviewCommuteEdgeProps) {
  const icon = TRANSPORT_ICONS[edge.transport_mode];
  const isAlt = edge.type === 'alternative';
  const label = formatCommuteEdgeLabel(edge);

  return (
    <button
      type="button"
      className={`overview-trip-edge ${compact ? 'overview-trip-edge--compact' : ''} ${isAlt ? 'overview-trip-edge--alt' : ''} ${selected ? 'overview-trip-edge--selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      title={formatCommuteEdgeTitle(edge)}
    >
      <span className="overview-trip-edge__line" aria-hidden />
      <span className={`trip-edge__label ${isAlt ? 'trip-edge__label--alt' : ''}`}>
        <span className="trip-edge__icon">{icon}</span>
        <span>{label}</span>
      </span>
    </button>
  );
}
