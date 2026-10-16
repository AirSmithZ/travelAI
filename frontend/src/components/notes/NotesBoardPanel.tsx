import { useMemo } from 'react';
import { usePlanStore } from '../../stores/usePlanStore';
import { deriveSegments } from '../../utils/citySegments';
import {
  buildNotesBoard,
  groupNotesBoard,
  type NotesBoardItem,
} from '../../utils/notesBoard';
import './NotesBoardPanel.css';

function confidenceLabel(c: NotesBoardItem['confidence']): string {
  if (c === 'medium') return '来自你的描述';
  if (c === 'high') return '已核实';
  return '供参考';
}

function sourceLabel(s: NotesBoardItem['source']): string {
  switch (s) {
    case 'user':
      return '对话/备注';
    case 'kb':
      return '目的地常识';
    case 'evidence':
      return '玩法印证';
    case 'tips':
      return '节点注意';
    default:
      return '系统';
  }
}

/**
 * NOTE-BOARD-01 / P130：行前注意看板（习俗/行李/签证等）。
 * 与节点 tips 分工：看板 = 行前汇总；tips = 当场注意。
 */
export function NotesBoardPanel({ onClose }: { onClose?: () => void }) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const itinerary = usePlanStore((s) => s.getItinerary());
  const tr = plan.trip_request;

  const items = useMemo(() => {
    const tipLines: string[] = [];
    for (const day of itinerary?.days ?? []) {
      for (const node of day.nodes ?? []) {
        for (const tip of node.tips ?? []) {
          if (tip?.trim()) tipLines.push(tip.trim());
        }
      }
    }
    const evidenceLines: string[] = [];
    for (const e of itinerary?.meta?.evidence ?? []) {
      if (e.title) evidenceLines.push(e.title);
      if (e.snippet) evidenceLines.push(e.snippet);
    }
    for (const m of plan.evidence_link_modules ?? []) {
      if (m.status !== 'ok') continue;
      if (m.result?.title) evidenceLines.push(m.result.title);
      if (m.result?.snippet) evidenceLines.push(m.result.snippet);
      for (const p of m.candidatePois ?? []) {
        if (p.trim()) evidenceLines.push(p.trim());
      }
    }
    return buildNotesBoard({
      destination: tr.destination,
      free_text: tr.free_text,
      notes: tr.notes,
      tipLines,
      evidenceLines,
      cities: deriveSegments(tr).map((s) => s.city),
    });
  }, [tr, itinerary, plan.evidence_link_modules]);

  const groups = useMemo(() => groupNotesBoard(items), [items]);
  const hasItinerary = Boolean(itinerary?.days?.length);

  return (
    <section className="notes-board" aria-label="行前注意事项">
      <header className="notes-board__head">
        <div className="notes-board__head-text">
          <h3 className="notes-board__title">行前注意</h3>
          <p className="notes-board__desc">
            汇总签证/行李/习俗等（供参考）。节点上的「注意事项」仍是当场提醒。
          </p>
        </div>
        {onClose ? (
          <button type="button" className="notes-board__close" onClick={onClose}>
            关闭
          </button>
        ) : null}
      </header>

      {!tr.destination?.trim() ? (
        <p className="notes-board__empty" role="status">
          先确定目的地后，将按城市给出常识清单；也可在对话里写签证/行李偏好。
        </p>
      ) : (
        <div className="notes-board__body">
          {groups.map((g) => (
            <div key={g.category} className="notes-board__group">
              <h4 className="notes-board__group-title">{g.label}</h4>
              <ul className="notes-board__list">
                {g.items.map((it) => (
                  <li key={it.id} className="notes-board__item">
                    <p className="notes-board__text">{it.text}</p>
                    <p className="notes-board__meta">
                      <span>{confidenceLabel(it.confidence)}</span>
                      <span aria-hidden>·</span>
                      <span>{sourceLabel(it.source)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!hasItinerary ? (
            <p className="notes-board__hint">
              生成玩法后，还会从节点 tips / 印证里抽注意类句子并入此板。
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
