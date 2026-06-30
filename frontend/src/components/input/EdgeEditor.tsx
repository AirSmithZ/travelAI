import { useEffect, useState } from 'react';
import { usePlanStore, findNodeContext, findEdgeContext } from '../../stores/usePlanStore';
import type { EdgeType, TransportMode } from '../../types/itinerary';
import { TRANSPORT_ICONS } from '../../data/categoryTokens';
import { FormField, FormInput, FormRow, FormSection, FormSelect } from '../ui/FormField';
import './EdgeEditor.css';

const TRANSPORT_OPTIONS: TransportMode[] = ['walk', 'subway', 'bus', 'taxi', 'flight', 'ferry'];

export function EdgeEditor() {
  const itinerary = usePlanStore((s) => s.getItinerary());
  const selectedEdgeId = usePlanStore((s) => s.selectedEdgeId);
  const updateEdge = usePlanStore((s) => s.updateEdge);
  const updateCrossDayEdge = usePlanStore((s) => s.updateCrossDayEdge);
  const removeEdge = usePlanStore((s) => s.removeEdge);
  const removeCrossDayEdge = usePlanStore((s) => s.removeCrossDayEdge);
  const selectEdge = usePlanStore((s) => s.selectEdge);

  const ctx =
    itinerary && selectedEdgeId ? findEdgeContext(itinerary, selectedEdgeId) : null;
  const edge = ctx?.edge;

  const [durationDraft, setDurationDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');

  useEffect(() => {
    if (!edge) return;
    setDurationDraft(String(edge.duration_minutes));
    setLabelDraft(edge.label ?? '');
  }, [edge?.id, edge?.duration_minutes, edge?.label]);

  if (!itinerary || !selectedEdgeId) {
    return (
      <div className="edge-editor edge-editor--empty">
        <p className="edge-editor__hint">未选中连线。</p>
      </div>
    );
  }

  if (!ctx || !edge) {
    return (
      <div className="edge-editor edge-editor--empty">
        <p className="edge-editor__hint">连线不存在或已被删除，请在路线图中重新选择。</p>
      </div>
    );
  }

  const fromCtx = findNodeContext(itinerary, edge.from);
  const toCtx = findNodeContext(itinerary, edge.to);

  const dayIndex = ctx.scope === 'day' ? ctx.dayIndex : null;
  const day = dayIndex !== null ? itinerary.days[dayIndex] : null;
  const candidateNodes = day?.nodes.filter((n) => n.id !== edge.from) ?? [];

  const applyPatch = (patch: Parameters<typeof updateEdge>[2]) => {
    if (ctx.scope === 'day') updateEdge(ctx.dayIndex, edge.id, patch);
    else updateCrossDayEdge(edge.id, patch);
  };

  const commitDuration = () => {
    const n = Math.max(0, parseInt(durationDraft, 10) || 0);
    setDurationDraft(String(n));
    if (n !== edge.duration_minutes) applyPatch({ duration_minutes: n });
  };

  const commitLabel = () => {
    const label = labelDraft.trim() || undefined;
    if (label !== (edge.label ?? undefined)) applyPatch({ label });
  };

  const handleDelete = () => {
    if (ctx.scope === 'day') removeEdge(ctx.dayIndex, edge.id);
    else removeCrossDayEdge(edge.id);
    selectEdge(null);
  };

  return (
    <div className="edge-editor">
      <div className="edge-editor__head">
        <span>{ctx.scope === 'cross_day' ? '跨日连线' : `Day ${day?.day_index ?? ''}`}</span>
        <span className="edge-editor__type">{edge.type === 'primary' ? '主路线' : '备选'}</span>
      </div>

      <div className="edge-editor__scroll">
        <FormSection title="连接">
          <FormField label="起点">
            <FormInput readOnly value={fromCtx?.node.name ?? edge.from} />
          </FormField>
          {ctx.scope === 'day' && day ? (
            <FormField label="终点">
              <FormSelect
                value={edge.to}
                onChange={(e) => applyPatch({ to: e.target.value })}
              >
                {candidateNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          ) : (
            <FormField label="终点">
              <FormInput readOnly value={toCtx?.node.name ?? edge.to} />
            </FormField>
          )}
        </FormSection>

        <FormSection title="属性">
          <FormRow>
            <FormField label="类型">
              <FormSelect
                value={edge.type}
                onChange={(e) => applyPatch({ type: e.target.value as EdgeType })}
              >
                <option value="primary">主路线（实线）</option>
                <option value="alternative">备选（虚线）</option>
              </FormSelect>
            </FormField>
            <FormField label="交通">
              <FormSelect
                value={edge.transport_mode}
                onChange={(e) =>
                  applyPatch({ transport_mode: e.target.value as TransportMode })
                }
              >
                {TRANSPORT_OPTIONS.map((mode) => (
                  <option key={mode} value={mode}>
                    {TRANSPORT_ICONS[mode]} {mode}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="耗时（分钟）">
            <FormInput
              type="number"
              min={0}
              value={durationDraft}
              onChange={(e) => setDurationDraft(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDuration();
                }
              }}
            />
          </FormField>
          <FormField label="标注">
            <FormInput
              value={labelDraft}
              placeholder="如：步行 15 分钟"
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitLabel();
                }
              }}
            />
          </FormField>
        </FormSection>
      </div>

      <div className="edge-editor__footer">
        <button type="button" className="form-btn form-btn--danger" onClick={handleDelete}>
          删除连线
        </button>
      </div>
    </div>
  );
}
