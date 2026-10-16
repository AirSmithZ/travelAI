import { useEffect, type CSSProperties } from 'react';
import type { DayPlan, TripEdge, TripNode } from '../types';
import { categoryMeta, transportLabel } from '../types';

interface FlowBoardProps {
  days: DayPlan[];
  scope: 'day' | 'all';
  dayIndex: number;
  crossEdges: TripEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPickDay: (index: number) => void;
}

function incomingOf(day: DayPlan, crossEdges: TripEdge[], nodeId: string): TripEdge | null {
  return (
    day.edges.find((edge) => edge.to === nodeId) ??
    crossEdges.find((edge) => edge.to === nodeId) ??
    null
  );
}

function NodeCard({
  node,
  selected,
  compact,
  onSelect,
}: {
  node: TripNode;
  selected: boolean;
  compact?: boolean;
  onSelect: (id: string) => void;
}) {
  const meta = categoryMeta(node.category);
  const time = compact
    ? node.start_time
    : [node.start_time, node.end_time].filter(Boolean).join(' – ');
  const tone = {
    '--node-color': meta.color,
    '--node-glow': meta.glow,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`trip-node${compact ? ' trip-node--compact' : ' trip-node--flow'}${selected ? ' trip-node--selected' : ''}${node.is_optional ? ' trip-node--optional' : ''}`}
      style={tone}
      data-node-id={node.id}
      aria-pressed={selected}
      onClick={() => onSelect(node.id)}
    >
      <span className="trip-node__header">
        <span className="trip-node__icon" aria-hidden>
          {meta.icon}
        </span>
        <span className="trip-node__category">
          {meta.label}
          {node.is_optional ? ' · 可选' : ''}
        </span>
        {node.floor ? <span className="trip-node__floor">{node.floor}</span> : null}
      </span>
      <span className="trip-node__name">{node.name}</span>
      {time ? <span className="trip-node__time">{time}</span> : null}
      {!compact && node.cost_label ? <span className="trip-node__cost">{node.cost_label}</span> : null}
    </button>
  );
}

export function FlowBoard({
  days,
  scope,
  dayIndex,
  crossEdges,
  selectedId,
  onSelect,
  onPickDay,
}: FlowBoardProps) {
  useEffect(() => {
    if (!selectedId || typeof CSS === 'undefined' || !CSS.escape) return;
    const el = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(selectedId)}"]`);
    const board = el?.closest<HTMLElement>('.board-scroll');
    if (!el || !board) return;
    const elRect = el.getBoundingClientRect();
    const boxRect = board.getBoundingClientRect();
    const needY = elRect.top < boxRect.top || elRect.bottom > boxRect.bottom;
    const needX = elRect.left < boxRect.left || elRect.right > boxRect.right;
    if (!needY && !needX) return;
    board.scrollTo({
      top: needY ? Math.max(0, board.scrollTop + (elRect.top - boxRect.top) - 12) : board.scrollTop,
      left: needX ? Math.max(0, board.scrollLeft + (elRect.left - boxRect.left) - 12) : board.scrollLeft,
      behavior: 'smooth',
    });
  }, [selectedId, scope, dayIndex]);

  if (scope === 'day') {
    const day = days[dayIndex];
    if (!day) return <p className="empty-note">这一天还没有行程。</p>;
    return (
      <div className="board-scroll">
        <header className="day-banner">
          <strong>
            D{day.day_index} {day.weekday} {day.date.slice(5)} {day.region}
          </strong>
          <p>{day.label}</p>
        </header>
        <ol className="day-flow">
          {day.nodes.map((node, index) => {
            const edge = incomingOf(day, crossEdges, node.id);
            const selected = node.id === selectedId;
            return (
              <li key={node.id}>
                {edge ? (
                  <p className="hop">
                    {transportLabel(edge.transport_mode)}
                    {edge.duration_minutes ? ` · ${edge.duration_minutes} 分钟` : ''}
                    {edge.label ? ` · ${edge.label}` : ''}
                  </p>
                ) : index > 0 ? (
                  <p className="hop hop--quiet">接着</p>
                ) : null}
                <NodeCard node={node} selected={selected} onSelect={onSelect} />
              </li>
            );
          })}
        </ol>
        <div className="scroll-pad scroll-pad--y" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="board-scroll board-scroll--columns">
      <div className="columns">
        {days.map((day, index) => (
          <section key={day.date} className={`col${index === dayIndex ? ' is-target' : ''}`} data-day-col={day.day_index}>
            <button type="button" className="col-head" onClick={() => onPickDay(index)}>
              <b>
                D{day.day_index} {day.region}
              </b>
              <span>
                {day.date.slice(5)} {day.weekday} · {day.nodes.length} 站
              </span>
              {index === dayIndex ? <em>当前这一天</em> : null}
            </button>
            {day.nodes.map((node) => {
              const selected = node.id === selectedId;
              return (
                <NodeCard key={node.id} node={node} selected={selected} compact onSelect={onSelect} />
              );
            })}
          </section>
        ))}
        <div className="scroll-pad scroll-pad--x" aria-hidden="true" />
      </div>
      <div className="scroll-pad scroll-pad--y" aria-hidden="true" />
    </div>
  );
}
