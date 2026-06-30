import { memo } from 'react';
import { getBezierPath, Position } from '@xyflow/react';
import { TRANSPORT_ICONS } from '../../data/categoryTokens';
import type { ItineraryEdge } from '../../types/itinerary';
import {
  OVERVIEW_EDGE_LABEL,
  OVERVIEW_EDGE_STROKE,
} from '../../utils/overviewExportTokens';
import type { OverviewEdgeSide } from '../../utils/overviewEdgeGeometry';
import './OverviewBezierEdge.css';

interface OverviewBezierEdgeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sourceSide?: OverviewEdgeSide;
  targetSide?: OverviewEdgeSide;
  edge: ItineraryEdge;
  variant?: 'default' | 'region';
}

const SIDE_TO_POSITION: Record<OverviewEdgeSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

function estimateLabelWidth(text: string): number {
  let width = 14;
  for (const ch of text) {
    width += ch.charCodeAt(0) > 127 ? 9.5 : 5.5;
  }
  return Math.min(Math.max(width, 52), 120);
}

function OverviewBezierEdgeComponent({
  x1,
  y1,
  x2,
  y2,
  sourceSide = 'right',
  targetSide = 'left',
  edge,
  variant = 'default',
}: OverviewBezierEdgeProps) {
  const isAlt = edge.type === 'alternative';
  const icon = TRANSPORT_ICONS[edge.transport_mode];
  const labelText = `${icon} ${edge.duration_minutes} 分钟`;

  const [path, labelX, labelY] = getBezierPath({
    sourceX: x1,
    sourceY: y1,
    targetX: x2,
    targetY: y2,
    sourcePosition: SIDE_TO_POSITION[sourceSide],
    targetPosition: SIDE_TO_POSITION[targetSide],
  });

  const minX = Math.min(x1, x2, labelX) - 8;
  const minY = Math.min(y1, y2, labelY) - 16;
  const maxX = Math.max(x1, x2, labelX) + 8;
  const maxY = Math.max(y1, y2, labelY) + 16;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const labelW = estimateLabelWidth(labelText);
  const labelH = 20;

  const strokeColor = isAlt
    ? OVERVIEW_EDGE_STROKE.alt
    : variant === 'region'
      ? OVERVIEW_EDGE_STROKE.region
      : OVERVIEW_EDGE_STROKE.default;

  return (
    <svg
      className={`overview-bezier-edge ${variant === 'region' ? 'overview-bezier-edge--region' : ''}`}
      style={{ left: minX, top: minY, width: w, height: h }}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      overflow="visible"
      aria-hidden
    >
      <g transform={`translate(${-minX}, ${-minY})`}>
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={isAlt ? 1.5 : 1.75}
          strokeLinecap="round"
          strokeDasharray={isAlt ? '5 4' : undefined}
          opacity={isAlt ? 0.85 : 1}
        />
        {/* label 须用绝对坐标 labelX/Y：外层 g 已做 translate(-minX,-minY) */}
        <g transform={`translate(${labelX}, ${labelY})`} opacity={isAlt ? 0.85 : 1}>
          <rect
            x={-labelW / 2}
            y={-labelH / 2}
            width={labelW}
            height={labelH}
            rx={labelH / 2}
            fill={OVERVIEW_EDGE_LABEL.fill}
            stroke={OVERVIEW_EDGE_LABEL.stroke}
            strokeWidth={1}
            strokeDasharray={isAlt ? '3 2' : undefined}
          />
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            fill={OVERVIEW_EDGE_LABEL.text}
            fontSize={9}
            fontWeight={500}
            fontFamily="'Noto Sans SC', sans-serif"
          >
            {labelText}
          </text>
        </g>
      </g>
    </svg>
  );
}

export const OverviewBezierEdge = memo(OverviewBezierEdgeComponent);
