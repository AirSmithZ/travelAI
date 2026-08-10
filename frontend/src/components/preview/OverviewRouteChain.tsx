import { useMemo } from 'react';
import type { DayPlan, ItineraryNode } from '../../types/itinerary';
import type { CellLayoutResult } from '../../utils/layoutOverview';
import type { DragPreview } from '../../hooks/useOverviewNodeDrag';
import { connectionBetweenPlacements } from '../../utils/overviewEdgeGeometry';
import {
  buildCellRouteSegments,
  groupRouteSegments,
} from '../../utils/overviewRoute';
import { OverviewNodeCard } from './OverviewNodeCard';
import { OverviewBezierEdge } from './OverviewBezierEdge';
import './OverviewRouteChain.css';

interface OverviewRouteChainProps {
  day: DayPlan;
  nodes: ItineraryNode[];
  cellLayout: CellLayoutResult;
  compact?: boolean;
  exportMode?: boolean;
  selectedNodeId: string | null;
  dragPreview?: DragPreview | null;
  regionEnter?: { nodeId: string; direction: 'up' | 'down' } | null;
  onSelectNode: (nodeId: string) => void;
  onOpenMap: (nodeId: string) => void;
  onNodePointerDown: (
    e: React.PointerEvent,
    nodeId: string,
  ) => void;
  onNodePointerUp: (e: React.PointerEvent) => void;
  /** B-P6-02 */
  primaryHotelIds?: Set<string>;
}

export function OverviewRouteChain({
  day,
  nodes,
  cellLayout,
  compact,
  exportMode,
  selectedNodeId,
  dragPreview,
  regionEnter,
  onSelectNode,
  onOpenMap,
  onNodePointerDown,
  onNodePointerUp,
  primaryHotelIds,
}: OverviewRouteChainProps) {
  const blocks = useMemo(() => {
    const segments = buildCellRouteSegments(day, nodes);
    return groupRouteSegments(segments);
  }, [day, nodes]);

  const { placements, edgePlacements, altEdgePlacements, width, height } = cellLayout;

  const edgeDragPreview = useMemo(() => {
    if (!dragPreview) return null;
    return {
      nodeId: dragPreview.nodeId,
      dx: dragPreview.ghostLocalDx,
      dy: dragPreview.ghostLocalDy,
    };
  }, [dragPreview]);

  const liveEdges = useMemo(() => {
    return edgePlacements.map((ep) => {
      const fromP = placements.get(ep.edge.from);
      const toP = placements.get(ep.edge.to);
      if (!fromP || !toP) return ep;
      return connectionBetweenPlacements(fromP, toP, ep.edge, edgeDragPreview);
    });
  }, [edgePlacements, placements, edgeDragPreview]);

  const liveAltEdges = useMemo(() => {
    return altEdgePlacements.map((ep) => {
      const fromP = placements.get(ep.edge.from);
      const toP = placements.get(ep.edge.to);
      if (!fromP || !toP) return ep;
      return connectionBetweenPlacements(fromP, toP, ep.edge, edgeDragPreview);
    });
  }, [altEdgePlacements, placements, edgeDragPreview]);

  const sceneGroups = useMemo(() => {
    return blocks
      .filter((b) => b.label)
      .map((block) => {
        const pts = block.segments
          .map((s) => placements.get(s.node.id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        if (pts.length === 0) return null;
        const minX = Math.min(...pts.map((p) => p.x)) - 10;
        const minY = Math.min(...pts.map((p) => p.y)) - 22;
        const maxX = Math.max(...pts.map((p) => p.x + p.width)) + 6;
        const maxY = Math.max(...pts.map((p) => p.y + p.height)) + 6;
        return {
          label: block.label!,
          left: minX,
          top: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      })
      .filter((g): g is NonNullable<typeof g> => Boolean(g));
  }, [blocks, placements]);

  return (
    <div className="overview-route-chain" style={{ width, height }}>
      {sceneGroups.map((g) => (
        <div
          key={g.label}
          className="overview-route-chain__group scene-group-node"
          style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
        >
          <span className="scene-group-node__label">{g.label}</span>
        </div>
      ))}

      {liveEdges.map(({ edge, x1, y1, x2, y2, sourceSide, targetSide }) => (
        <OverviewBezierEdge
          key={edge.id}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          sourceSide={sourceSide}
          targetSide={targetSide}
          edge={edge}
        />
      ))}

      {liveAltEdges.map(({ edge, x1, y1, x2, y2, sourceSide, targetSide }) => (
        <OverviewBezierEdge
          key={edge.id}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          sourceSide={sourceSide}
          targetSide={targetSide}
          edge={edge}
        />
      ))}

      {nodes.map((node) => {
        const place = placements.get(node.id);
        if (!place) return null;
        const preview =
          dragPreview?.nodeId === node.id ? dragPreview : null;
        const enter =
          !preview && regionEnter?.nodeId === node.id ? regionEnter : null;
        const isGhostSource = Boolean(preview);

        return (
          <div
            key={node.id}
            className={[
              'overview-route-chain__node',
              preview ? 'overview-route-chain__node--dragging' : '',
              isGhostSource ? 'overview-route-chain__node--ghost-source' : '',
              enter ? `overview-route-chain__node--region-enter overview-route-chain__node--region-enter-${enter.direction}` : '',
            ].filter(Boolean).join(' ')}
            style={{
              left: place.x,
              top: place.y,
              width: place.width,
            }}
            onPointerDown={(e) => onNodePointerDown(e, node.id)}
            onPointerUp={onNodePointerUp}
          >
            <OverviewNodeCard
              node={node}
              compact={compact}
              exportMode={exportMode}
              selected={node.id === selectedNodeId}
              primaryHotel={primaryHotelIds?.has(node.id)}
              onSelect={() => onSelectNode(node.id)}
              onOpenMap={() => onOpenMap(node.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
