import { useEffect, useState } from 'react';
import { usePlanStore, findNodeContext, findEdgeContext } from '../../stores/usePlanStore';
import type { EdgeType, TransportMode } from '../../types/itinerary';
import { TRANSPORT_ICONS } from '../../data/categoryTokens';
import { FormField, FormInput, FormNumberInput, FormRow, FormSection, FormSelect } from '../ui/FormField';
import {
  CommuteApiError,
  lookupCommute,
  type CommuteCandidate,
} from '../../api/commute';
import { cascadeDayScheduleFromEdges } from '../../utils/scheduleCascade';
import './EdgeEditor.css';

const TRANSPORT_OPTIONS: TransportMode[] = ['walk', 'subway', 'bus', 'taxi', 'flight', 'ferry'];

const SOURCE_LABEL: Record<string, string> = {
  directions: '路网',
  user_hint: '提示词',
  estimate: '估算',
};

function hasValidCoords(lat?: number, lng?: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

export function EdgeEditor() {
  const itinerary = usePlanStore((s) => s.getItinerary());
  const tripRequest = usePlanStore((s) => s.getActivePlan().trip_request);
  const selectedEdgeId = usePlanStore((s) => s.selectedEdgeId);
  const updateEdge = usePlanStore((s) => s.updateEdge);
  const updateCrossDayEdge = usePlanStore((s) => s.updateCrossDayEdge);
  const updateDay = usePlanStore((s) => s.updateDay);
  const removeEdge = usePlanStore((s) => s.removeEdge);
  const removeCrossDayEdge = usePlanStore((s) => s.removeCrossDayEdge);
  const selectEdge = usePlanStore((s) => s.selectEdge);

  const ctx =
    itinerary && selectedEdgeId ? findEdgeContext(itinerary, selectedEdgeId) : null;
  const edge = ctx?.edge;

  const [durationDraft, setDurationDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CommuteCandidate[]>([]);
  const [lookupWarnings, setLookupWarnings] = useState<string[]>([]);
  const [straightM, setStraightM] = useState<number | null>(null);

  useEffect(() => {
    if (!edge) return;
    setDurationDraft(String(edge.duration_minutes));
    setLabelDraft(edge.label ?? '');
    setCandidates([]);
    setLookupError(null);
    setLookupWarnings([]);
    setStraightM(null);
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

  const realignDayAfterEdgeChange = () => {
    if (ctx.scope !== 'day') return;
    const fresh = usePlanStore.getState().getItinerary();
    const d = fresh?.days[ctx.dayIndex];
    if (!d) return;
    const cascaded = cascadeDayScheduleFromEdges(d);
    updateDay(ctx.dayIndex, { nodes: cascaded.nodes });
  };

  const applyPatch = (patch: Parameters<typeof updateEdge>[2]) => {
    if (ctx.scope === 'day') updateEdge(ctx.dayIndex, edge.id, patch);
    else updateCrossDayEdge(edge.id, patch);
  };

  const commitDuration = () => {
    const n = Math.max(0, parseInt(durationDraft, 10) || 0);
    setDurationDraft(String(n));
    if (n !== edge.duration_minutes) {
      applyPatch({ duration_minutes: n });
      realignDayAfterEdgeChange();
    }
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

  const handleLookup = async () => {
    const fromNode = fromCtx?.node;
    const toNode = toCtx?.node;
    if (!fromNode || !toNode) {
      setLookupError('找不到起终点节点');
      return;
    }
    if (!hasValidCoords(fromNode.lat, fromNode.lng) || !hasValidCoords(toNode.lat, toNode.lng)) {
      setLookupError('起终点缺少有效坐标，请先完成地理编码或在地图上定点');
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setCandidates([]);
    setLookupWarnings([]);
    try {
      const resp = await lookupCommute({
        from_point: { lat: fromNode.lat, lng: fromNode.lng, name: fromNode.name },
        to_point: { lat: toNode.lat, lng: toNode.lng, name: toNode.name },
        free_text: tripRequest?.free_text ?? '',
        notes: tripRequest?.notes ?? '',
        use_directions: true,
      });
      setCandidates(resp.candidates);
      setLookupWarnings(resp.warnings ?? []);
      setStraightM(resp.straight_line_meters ?? null);
      if (!resp.candidates.length) {
        setLookupError('未找到可用通勤方案');
      }
    } catch (e) {
      const msg =
        e instanceof CommuteApiError ? e.message : e instanceof Error ? e.message : '通勤查询失败';
      setLookupError(msg);
    } finally {
      setLookupLoading(false);
    }
  };

  const applyCandidate = (c: CommuteCandidate) => {
    const label = c.label?.trim() || undefined;
    applyPatch({
      transport_mode: c.transport_mode,
      duration_minutes: c.duration_minutes,
      distance_meters: c.distance_meters ?? undefined,
      label,
      route_source: c.source,
    });
    setDurationDraft(String(c.duration_minutes));
    setLabelDraft(label ?? '');
    realignDayAfterEdgeChange();
  };

  const sourceHint =
    edge.route_source && SOURCE_LABEL[edge.route_source]
      ? SOURCE_LABEL[edge.route_source]
      : null;

  return (
    <div className="edge-editor">
      <div className="edge-editor__head">
        <span>{ctx.scope === 'cross_day' ? '跨日连线' : `Day ${day?.day_index ?? ''}`}</span>
        <span className="edge-editor__type">
          {edge.type === 'primary' ? '主路线' : '备选'}
          {sourceHint ? ` · ${sourceHint}` : ''}
        </span>
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
                  applyPatch({
                    transport_mode: e.target.value as TransportMode,
                    route_source: undefined,
                  })
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
            <FormNumberInput
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

        <FormSection title="查询通勤">
          <p className="edge-editor__hint">
            按需查询路网时间；海路/山路等搜不到时，会尝试匹配行程提示词中的路线描述。
          </p>
          <button
            type="button"
            className="form-btn form-btn--primary edge-editor__lookup-btn"
            onClick={() => void handleLookup()}
            disabled={lookupLoading}
          >
            {lookupLoading ? '查询中…' : '查询通勤'}
          </button>
          {straightM != null && (
            <p className="edge-editor__meta">直线约 {(straightM / 1000).toFixed(1)} km</p>
          )}
          {lookupError && <p className="edge-editor__error">{lookupError}</p>}
          {lookupWarnings.map((w) => (
            <p key={w} className="edge-editor__warn">
              {w}
            </p>
          ))}
          {candidates.length > 0 && (
            <ul className="edge-editor__candidates">
              {candidates.map((c, i) => (
                <li key={`${c.source}-${c.transport_mode}-${c.duration_minutes}-${i}`}>
                  <button
                    type="button"
                    className={
                      c.recommended
                        ? 'edge-editor__candidate edge-editor__candidate--rec'
                        : 'edge-editor__candidate'
                    }
                    onClick={() => applyCandidate(c)}
                  >
                    <span className="edge-editor__candidate-main">
                      {TRANSPORT_ICONS[c.transport_mode]} {c.transport_mode} ·{' '}
                      {c.duration_minutes} 分钟
                      {c.recommended ? ' · 推荐' : ''}
                    </span>
                    <span className="edge-editor__candidate-sub">
                      {SOURCE_LABEL[c.source] ?? c.source}
                      {c.label ? ` · ${c.label}` : ''}
                    </span>
                    {c.summary && (
                      <span className="edge-editor__candidate-sum">{c.summary}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
