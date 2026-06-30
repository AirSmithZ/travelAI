import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlanStore } from '../../stores/usePlanStore';
import type { FormPatch } from '../../types/travelPlan';
import type { AddNodePayload, UpdateEdgePayload } from '../../utils/applyItineraryPatch';
import type { TransportMode } from '../../types/itinerary';
import { groupPatchesIntoSteps, type PatchStep } from '../../utils/patchSteps';
import { PatchConfirmCard } from './PatchConfirmCard';
import './PatchConfirmPanel.css';

function clonePatches(patches: FormPatch[]): FormPatch[] {
  return patches.map((p) => ({
    ...p,
    new_value:
      typeof p.new_value === 'object' && p.new_value !== null
        ? { ...(p.new_value as object) }
        : p.new_value,
    fork_plan: p.fork_plan ? { ...p.fork_plan } : undefined,
  }));
}

function PatchSummary({ patch }: { patch: FormPatch }) {
  return (
    <PatchConfirmCard
      patch={patch}
      variant="summary"
    />
  );
}

function TripRequestStepEditor({
  patches,
  onChange,
}: {
  patches: FormPatch[];
  onChange: (patchId: string, value: unknown) => void;
}) {
  return (
    <div className="patch-step__fields">
      {patches.map((patch) => {
        const field = patch.field_path;
        const val = patch.new_value;
        const lowClass = patch.confidence === 'low' ? ' patch-step__field--low' : '';

        if (field === 'preference_tags' && patch.action === 'append') {
          return (
            <div key={patch.id} className={`patch-step__block${lowClass}`}>
              <PatchSummary patch={patch} />
              <label className="patch-step__field">
                <span>{patch.label}</span>
                <input
                  type="text"
                  value={String(val ?? '')}
                  onChange={(e) => onChange(patch.id, e.target.value)}
                />
              </label>
            </div>
          );
        }

        if (field === 'preference_tags' && patch.action === 'set') {
          const tags = Array.isArray(val)
            ? val.map(String).join('、')
            : String(val ?? '');
          return (
            <div key={patch.id} className={`patch-step__block${lowClass}`}>
              <PatchSummary patch={patch} />
              <label className="patch-step__field">
                <span>{patch.label}</span>
                <input
                  type="text"
                  value={tags}
                  placeholder="用顿号或逗号分隔"
                  onChange={(e) =>
                    onChange(
                      patch.id,
                      e.target.value
                        .split(/[、,，/|]+/)
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </label>
            </div>
          );
        }

        if (field === 'day_count') {
          return (
            <div key={patch.id} className={`patch-step__block${lowClass}`}>
              <PatchSummary patch={patch} />
              <label className="patch-step__field">
                <span>{patch.label}</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={Number(val) || ''}
                  onChange={(e) => onChange(patch.id, Number(e.target.value))}
                />
              </label>
            </div>
          );
        }

        if (field === 'travelers') {
          return (
            <div key={patch.id} className={`patch-step__block${lowClass}`}>
              <PatchSummary patch={patch} />
              <label className="patch-step__field">
                <span>{patch.label}</span>
                <input
                  type="number"
                  min={1}
                  value={Number(val) || ''}
                  onChange={(e) => onChange(patch.id, Number(e.target.value))}
                />
              </label>
            </div>
          );
        }

        return (
          <div key={patch.id} className={`patch-step__block${lowClass}`}>
            <PatchSummary patch={patch} />
            <label className="patch-step__field">
              <span>{patch.label}</span>
              <input
                type="text"
                value={String(val ?? '')}
                onChange={(e) => onChange(patch.id, e.target.value)}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

const TRANSPORT_OPTIONS: { value: TransportMode; label: string }[] = [
  { value: 'walk', label: '步行' },
  { value: 'subway', label: '地铁' },
  { value: 'bus', label: '公交' },
  { value: 'taxi', label: '打车' },
  { value: 'flight', label: '航班' },
  { value: 'ferry', label: '渡轮' },
];

function ItineraryStepEditor({
  patches,
  onChange,
}: {
  patches: FormPatch[];
  onChange: (patchId: string, value: unknown) => void;
}) {
  return (
    <div className="patch-step__fields">
      {patches.map((patch) => {
        const lowClass = patch.confidence === 'low' ? ' patch-step__field--low' : '';

        if (patch.action === 'add_node') {
          const payload = patch.new_value as AddNodePayload;
          return (
            <div key={patch.id} className={`patch-step__node-block${lowClass}`}>
              <PatchSummary patch={patch} />
              <label className="patch-step__field">
                <span>天数</span>
                <input
                  type="number"
                  min={1}
                  value={payload.day_index}
                  onChange={(e) =>
                    onChange(patch.id, {
                      ...payload,
                      day_index: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="patch-step__field">
                <span>节点名称</span>
                <input
                  type="text"
                  value={payload.node.name}
                  onChange={(e) =>
                    onChange(patch.id, {
                      ...payload,
                      node: { ...payload.node, name: e.target.value },
                    })
                  }
                />
              </label>
              <label className="patch-step__field">
                <span>开始时间</span>
                <input
                  type="text"
                  placeholder="17:00"
                  value={payload.node.start_time ?? ''}
                  onChange={(e) =>
                    onChange(patch.id, {
                      ...payload,
                      node: { ...payload.node, start_time: e.target.value },
                    })
                  }
                />
              </label>
              <label className="patch-step__field">
                <span>结束时间</span>
                <input
                  type="text"
                  placeholder="20:00"
                  value={payload.node.end_time ?? ''}
                  onChange={(e) =>
                    onChange(patch.id, {
                      ...payload,
                      node: { ...payload.node, end_time: e.target.value },
                    })
                  }
                />
              </label>
            </div>
          );
        }

        if (patch.action === 'update_edge') {
          const payload = patch.new_value as UpdateEdgePayload;
          const edgePatch = payload.patch ?? {};
          return (
            <div key={patch.id} className={`patch-step__node-block${lowClass}`}>
              <PatchSummary patch={patch} />
              <p className="patch-step__edge-id">连线 {payload.edge_id}</p>
              <label className="patch-step__field">
                <span>交通方式</span>
                <select
                  value={edgePatch.transport_mode ?? 'walk'}
                  onChange={(e) =>
                    onChange(patch.id, {
                      ...payload,
                      patch: { ...edgePatch, transport_mode: e.target.value as TransportMode },
                    })
                  }
                >
                  {TRANSPORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="patch-step__field">
                <span>耗时（分钟）</span>
                <input
                  type="number"
                  min={1}
                  value={edgePatch.duration_minutes ?? ''}
                  onChange={(e) =>
                    onChange(patch.id, {
                      ...payload,
                      patch: {
                        ...edgePatch,
                        duration_minutes: Number(e.target.value) || undefined,
                      },
                    })
                  }
                />
              </label>
              <label className="patch-step__field">
                <span>标注</span>
                <input
                  type="text"
                  value={edgePatch.label ?? ''}
                  placeholder="如：地铁 20 分钟"
                  onChange={(e) =>
                    onChange(patch.id, {
                      ...payload,
                      patch: { ...edgePatch, label: e.target.value || undefined },
                    })
                  }
                />
              </label>
            </div>
          );
        }

        return (
          <div key={patch.id} className={`patch-step__block${lowClass}`}>
            <PatchSummary patch={patch} />
            <label className="patch-step__field">
              <span>{patch.label}</span>
              <input
                type="text"
                value={String(patch.new_value ?? '')}
                onChange={(e) => onChange(patch.id, e.target.value)}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}

function ForkPlanStepEditor({
  patch,
  onChange,
}: {
  patch: FormPatch;
  onChange: (patchId: string, value: unknown) => void;
}) {
  const dest = patch.fork_plan?.destination ?? String(patch.new_value);
  return (
    <div className="patch-step__block">
      <PatchSummary patch={patch} />
      <label className="patch-step__field">
        <span>新目的地</span>
        <input
          type="text"
          value={dest}
          onChange={(e) =>
            onChange(patch.id, {
              ...patch.fork_plan,
              destination: e.target.value,
            })
          }
        />
      </label>
    </div>
  );
}

function StepEditor({
  step,
  drafts,
  onDraftChange,
}: {
  step: PatchStep;
  drafts: FormPatch[];
  onDraftChange: (patchId: string, value: unknown) => void;
}) {
  const stepPatches = step.patches.map((p) => drafts.find((d) => d.id === p.id) ?? p);

  if (step.kind === 'fork_plan') {
    const patch = stepPatches[0];
    if (!patch) return null;
    return (
      <ForkPlanStepEditor
        patch={patch}
        onChange={(id, val) => {
          onDraftChange(id, val);
        }}
      />
    );
  }

  if (step.kind === 'trip_request') {
    return <TripRequestStepEditor patches={stepPatches} onChange={onDraftChange} />;
  }

  return <ItineraryStepEditor patches={stepPatches} onChange={onDraftChange} />;
}

export function PatchConfirmPanel() {
  const pendingPatches = usePlanStore((s) => s.getActivePlan().pending_patches);
  const activePlan = usePlanStore((s) => s.getActivePlan());
  const confirmPatches = usePlanStore((s) => s.confirmPatches);
  const dismissPatches = usePlanStore((s) => s.dismissPatches);

  const steps = useMemo(() => groupPatchesIntoSteps(pendingPatches), [pendingPatches]);
  const [stepIndex, setStepIndex] = useState(0);
  const [drafts, setDrafts] = useState<FormPatch[]>([]);
  const [expanded, setExpanded] = useState(false);
  const prevPendingLenRef = useRef(0);
  const knownBatchIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDrafts(clonePatches(pendingPatches));

    const batchIds = new Set(
      pendingPatches.map((p) => p.batch_id).filter((id): id is string => Boolean(id)),
    );
    const hasNewBatch = [...batchIds].some((id) => !knownBatchIdsRef.current.has(id));
    const lenIncreased = pendingPatches.length > prevPendingLenRef.current;

    if (hasNewBatch || lenIncreased) {
      setStepIndex(0);
    } else if (pendingPatches.length < prevPendingLenRef.current) {
      setStepIndex((i) => Math.min(i, Math.max(0, steps.length - 1)));
    }

    prevPendingLenRef.current = pendingPatches.length;
    knownBatchIdsRef.current = batchIds;
  }, [pendingPatches, steps.length]);

  useEffect(() => {
    if (pendingPatches.length === 0) setExpanded(false);
  }, [pendingPatches.length]);

  const updateDraft = useCallback((patchId: string, value: unknown) => {
    setDrafts((prev) =>
      prev.map((p) => {
        if (p.id !== patchId) return p;
        if (p.action === 'fork_plan') {
          const dest = typeof value === 'string' ? value : (value as { destination: string }).destination;
          return {
            ...p,
            new_value: dest,
            fork_plan: {
              destination: dest,
              inherit_fields: p.fork_plan?.inherit_fields ?? [
                'preference_tags',
                'travelers',
                'budget_level',
              ],
            },
          };
        }
        return { ...p, new_value: value };
      }),
    );
  }, []);

  if (pendingPatches.length === 0 || steps.length === 0) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        className="patch-confirm-panel__collapsed-bar"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
      >
        <span className="patch-confirm-panel__collapsed-count">{pendingPatches.length} 项待确认</span>
        <span className="patch-confirm-panel__collapsed-action">展开编辑</span>
      </button>
    );
  }

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const stepPatches = currentStep.patches.map(
    (p) => drafts.find((d) => d.id === p.id) ?? p,
  );

  const applyStep = () => {
    confirmPatches(stepPatches);
  };

  const skipStep = () => {
    dismissPatches(currentStep.patches.map((p) => p.id));
  };

  const applyAll = () => {
    const all = pendingPatches.map((p) => drafts.find((d) => d.id === p.id) ?? p);
    confirmPatches(all);
  };

  const dismissAll = () => {
    dismissPatches(pendingPatches.map((p) => p.id));
  };

  return (
    <div className="patch-confirm-panel" aria-expanded>
      <div className="patch-confirm-panel__head">
        <span className="patch-confirm-panel__title">待确认修改</span>
        <div className="patch-confirm-panel__head-right">
          <span className="patch-confirm-panel__step">
            步骤 {stepIndex + 1}/{steps.length} · {currentStep.title}
          </span>
          <button
            type="button"
            className="patch-confirm-panel__collapse-btn"
            onClick={() => setExpanded(false)}
            aria-label="收起确认面板"
          >
            收起
          </button>
        </div>
      </div>

      <p className="patch-confirm-panel__hint">
        {currentStep.kind === 'fork_plan'
          ? `将为「${stepPatches[0]?.fork_plan?.destination ?? ''}」创建新计划，当前「${activePlan.title}」保留。`
          : '可在下方编辑解析结果，确认后写入计划并自动生成路线图（若尚未生成）。'}
      </p>

      <StepEditor step={currentStep} drafts={drafts} onDraftChange={updateDraft} />

      <div className="patch-confirm-panel__actions">
        <button type="button" className="patch-confirm-panel__primary" onClick={applyStep}>
          {currentStep.kind === 'fork_plan' ? '创建并切换' : '确认本步'}
        </button>
        <div className="patch-confirm-panel__secondary-row">
          <button type="button" className="patch-confirm-panel__link" onClick={skipStep}>
            忽略本步
          </button>
          {steps.length > 1 && (
            <>
              <span className="patch-confirm-panel__sep" aria-hidden>·</span>
              <button type="button" className="patch-confirm-panel__link" onClick={applyAll}>
                确认全部
              </button>
            </>
          )}
          <span className="patch-confirm-panel__sep" aria-hidden>·</span>
          <button type="button" className="patch-confirm-panel__link" onClick={dismissAll}>
            稍后处理
          </button>
        </div>
      </div>
    </div>
  );
}
