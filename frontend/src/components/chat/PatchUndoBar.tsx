import { useEffect, useState } from 'react';
import { usePlanStore } from '../../stores/usePlanStore';
import './PatchUndoBar.css';

/** UX-CHAT-03: short-lived undo after low-risk auto-apply. */
export function PatchUndoBar() {
  const snapshot = usePlanStore((s) => s.patchUndoSnapshot);
  const undoLastAutoPatches = usePlanStore((s) => s.undoLastAutoPatches);
  const clearPatchUndoSnapshot = usePlanStore((s) => s.clearPatchUndoSnapshot);
  const [leftSec, setLeftSec] = useState(0);

  useEffect(() => {
    if (!snapshot) {
      setLeftSec(0);
      return;
    }
    const tick = () => {
      const sec = Math.max(0, Math.ceil((snapshot.expiresAt - Date.now()) / 1000));
      setLeftSec(sec);
      if (sec <= 0) clearPatchUndoSnapshot();
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [snapshot, clearPatchUndoSnapshot]);

  if (!snapshot || leftSec <= 0) return null;

  return (
    <div className="patch-undo-bar" role="status">
      <span>
        已自动写入 {snapshot.count} 项（{leftSec}s）
      </span>
      <button type="button" className="patch-undo-bar__btn" onClick={() => undoLastAutoPatches()}>
        撤销
      </button>
    </div>
  );
}
