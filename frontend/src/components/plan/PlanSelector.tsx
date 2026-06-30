import { useState, useRef, useEffect, useLayoutEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePlanStore } from '../../stores/usePlanStore';
import { IconEdit, IconTrash } from './PlanIcons';
import './PlanSelector.css';

const DROPDOWN_GAP = 6;
const DROPDOWN_MAX_HEIGHT = 320;
const VIEWPORT_PADDING = 12;
const DROPDOWN_MIN_WIDTH = 280;

function computeDropdownStyle(trigger: HTMLElement, dropdownEl?: HTMLElement | null): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const maxWidth = viewportWidth - VIEWPORT_PADDING * 2;
  const width = Math.min(
    Math.max(dropdownEl?.offsetWidth ?? 0, rect.width, DROPDOWN_MIN_WIDTH),
    maxWidth,
  );

  let left = rect.left;
  if (left + width > viewportWidth - VIEWPORT_PADDING) {
    left = rect.right - width;
  }
  left = Math.max(VIEWPORT_PADDING, Math.min(left, viewportWidth - VIEWPORT_PADDING - width));

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING;
  const spaceAbove = rect.top - VIEWPORT_PADDING;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableHeight = Math.min(
    DROPDOWN_MAX_HEIGHT,
    Math.max(160, (openUp ? spaceAbove : spaceBelow) - DROPDOWN_GAP),
  );

  return {
    position: 'fixed',
    left,
    width,
    top: openUp ? undefined : rect.bottom + DROPDOWN_GAP,
    bottom: openUp ? window.innerHeight - rect.top + DROPDOWN_GAP : undefined,
    maxHeight: availableHeight,
  };
}

export function PlanSelector() {
  const plans = usePlanStore((s) => s.plans);
  const activePlanId = usePlanStore((s) => s.activePlanId);
  const createPlan = usePlanStore((s) => s.createPlan);
  const switchPlan = usePlanStore((s) => s.switchPlan);
  const deletePlan = usePlanStore((s) => s.deletePlan);
  const renamePlan = usePlanStore((s) => s.renamePlan);

  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});

  const active = plans.find((p) => p.id === activePlanId);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      setDropdownStyle(computeDropdownStyle(triggerRef.current, dropdownRef.current));
    };

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, plans.length, deleteConfirmId, renamingId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setDeleteConfirmId(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const startRename = (id: string, title: string) => {
    setRenamingId(id);
    setRenameValue(title);
    setDeleteConfirmId(null);
  };

  const commitRename = () => {
    if (renamingId) renamePlan(renamingId, renameValue);
    setRenamingId(null);
  };

  const requestDelete = (id: string) => {
    setDeleteConfirmId(id);
    setRenamingId(null);
  };

  const confirmDelete = (id: string) => {
    deletePlan(id);
    setDeleteConfirmId(null);
    if (plans.length <= 1) setOpen(false);
  };

  return (
    <div className="plan-selector" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="plan-selector__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="plan-selector__chevron" aria-hidden>
          ▾
        </span>
        <span className="plan-selector__label">{active?.title ?? '选择计划'}</span>
        <span className={`plan-selector__phase plan-selector__phase--${active?.phase ?? 'empty'}`}>
          {active?.phase === 'detailed' ? '已生成' : active?.phase === 'planning' ? '规划中' : '空白'}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="plan-selector__dropdown"
            style={dropdownStyle}
            role="listbox"
          >
            <ul className="plan-selector__list">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className={`plan-selector__item ${deleteConfirmId === plan.id ? 'plan-selector__item--confirm' : ''}`}
                >
                  {renamingId === plan.id ? (
                    <input
                      className="plan-selector__rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                    />
                  ) : deleteConfirmId === plan.id ? (
                    <div className="plan-selector__delete-confirm">
                      <p className="plan-selector__delete-text">
                        删除「<strong>{plan.title}</strong>」？此操作不可恢复。
                      </p>
                      <div className="plan-selector__delete-actions">
                        <button
                          type="button"
                          className="plan-selector__delete-btn plan-selector__delete-btn--cancel"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="plan-selector__delete-btn plan-selector__delete-btn--confirm"
                          onClick={() => confirmDelete(plan.id)}
                        >
                          确认删除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`plan-selector__item-btn ${plan.id === activePlanId ? 'plan-selector__item-btn--active' : ''}`}
                        onClick={() => {
                          switchPlan(plan.id);
                          setOpen(false);
                        }}
                      >
                        <span className="plan-selector__item-title">{plan.title}</span>
                        <span className="plan-selector__item-meta">
                          {plan.trip_request.destination || '未设目的地'}
                        </span>
                      </button>
                      <div className="plan-selector__actions">
                        <button
                          type="button"
                          className="plan-selector__icon-btn"
                          aria-label={`重命名「${plan.title}」`}
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(plan.id, plan.title);
                          }}
                        >
                          <IconEdit />
                        </button>
                        <button
                          type="button"
                          className="plan-selector__icon-btn plan-selector__icon-btn--danger"
                          aria-label={`删除「${plan.title}」`}
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDelete(plan.id);
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="plan-selector__new"
              onClick={() => {
                createPlan();
                setOpen(false);
              }}
            >
              ＋ 新建旅行计划
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
