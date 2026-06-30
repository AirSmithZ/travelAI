import { usePlanStore } from '../../stores/usePlanStore';
import type { FormPatch } from '../../types/travelPlan';
import { formatPatchValue } from '../../utils/patchSteps';
import './Chat.css';

interface PatchConfirmCardProps {
  patch: FormPatch;
  /** summary：Panel 内嵌摘要；interactive：独立确认卡（保留兼容） */
  variant?: 'summary' | 'interactive';
  onConfirm?: () => void;
  onDismiss?: () => void;
}

export function PatchConfirmCard({
  patch,
  variant = 'interactive',
  onConfirm,
  onDismiss,
}: PatchConfirmCardProps) {
  const confirmPatch = usePlanStore((s) => s.confirmPatch);
  const dismissPatch = usePlanStore((s) => s.dismissPatch);
  const activePlan = usePlanStore((s) => s.getActivePlan());

  const lowConfidence = patch.confidence === 'low';
  const cardClass = `patch-card${lowConfidence ? ' patch-card--low' : ''}${variant === 'summary' ? ' patch-card--summary' : ''}`;

  if (variant === 'summary') {
    return (
      <div className={cardClass}>
        <p className="patch-card__summary">{patch.summary}</p>
        {patch.old_value !== undefined && (
          <p className="patch-card__label">
            {patch.label}：{String(patch.old_value)} → {formatPatchValue(patch)}
          </p>
        )}
      </div>
    );
  }

  if (patch.action === 'fork_plan' && patch.fork_plan) {
    const dest = patch.fork_plan.destination;
    return (
      <div className={cardClass}>
        <p className="patch-card__summary">{patch.summary}</p>
        <p className="patch-card__label">
          {patch.label}：{dest}
        </p>
        <p className="patch-card__detail">
          将为「{dest}」创建新的旅行计划，当前「{activePlan.title}」将完整保留。
        </p>
        <div className="patch-card__actions">
          <button
            type="button"
            className="patch-card__confirm"
            onClick={onConfirm ?? (() => confirmPatch(patch))}
          >
            创建并切换
          </button>
          <button
            type="button"
            className="patch-card__cancel"
            onClick={onDismiss ?? (() => dismissPatch(patch.id))}
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <p className="patch-card__summary">{patch.summary}</p>
      <p className="patch-card__label">
        {patch.label}
        {patch.old_value !== undefined && (
          <>
            ：{String(patch.old_value)} → {formatPatchValue(patch)}
          </>
        )}
        {patch.old_value === undefined && <>：{formatPatchValue(patch)}</>}
      </p>
      <p className="patch-card__detail">确认后将写入计划数据，并可用于生成行程 / 同步路线图与地图。</p>
      <div className="patch-card__actions">
        <button
          type="button"
          className="patch-card__confirm"
          onClick={onConfirm ?? (() => confirmPatch(patch))}
        >
          确认
        </button>
        <button
          type="button"
          className="patch-card__cancel"
          onClick={onDismiss ?? (() => dismissPatch(patch.id))}
        >
          取消
        </button>
      </div>
    </div>
  );
}
