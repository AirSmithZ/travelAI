import { usePlanStore } from '../../stores/usePlanStore';
import { derivePlanReadiness } from '../../utils/planReadiness';
import './ReadinessChecklist.css';

interface ReadinessChecklistProps {
  onClose: () => void;
  onPrefill: (text: string) => void;
}

/** UX-CHAT-02: ephemeral generate gate in the chat timeline. */
export function ReadinessChecklist({ onClose, onPrefill }: ReadinessChecklistProps) {
  const plan = usePlanStore((s) => s.getActivePlan());
  const setLeftPanelMode = usePlanStore((s) => s.setLeftPanelMode);
  const generateItinerary = usePlanStore((s) => s.generateItinerary);
  const addChatMessage = usePlanStore((s) => s.addChatMessage);
  const isGenerating = usePlanStore((s) => s.isGeneratingItinerary);
  const readiness = derivePlanReadiness(plan);

  const primaryMissing = readiness.items.find((i) => !i.done && i.hard);

  const handleGenerate = async () => {
    if (!readiness.canGenerate) {
      if (primaryMissing?.action === 'open_flight') {
        setLeftPanelMode('flight');
      } else if (primaryMissing) {
        onPrefill(primaryMissing.hint);
      }
      return;
    }
    onClose();
    const result = await generateItinerary('generate');
    if (result === 'blocked') {
      addChatMessage('assistant', '仍无法生成：请先确认航班与目的地。');
    }
  };

  return (
    <div className="readiness-check" role="region" aria-label="生成前检查">
      <div className="readiness-check__head">
        <span className="readiness-check__title">生成前检查</span>
        <button type="button" className="readiness-check__close" onClick={onClose}>
          关闭
        </button>
      </div>
      <ul className="readiness-check__list">
        {readiness.items.map((item) => (
          <li
            key={item.id}
            className={`readiness-check__item${item.done ? ' readiness-check__item--done' : ''}`}
          >
            <span className="readiness-check__mark" aria-hidden>
              {item.done ? '✓' : item.hard ? '✗' : '○'}
            </span>
            <span>
              <strong>{item.label}</strong>
              <span className="readiness-check__detail"> · {item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {readiness.softWarnings.length > 0 && (
        <p className="readiness-check__warn">{readiness.softWarnings[0]}</p>
      )}
      <div className="readiness-check__actions">
        {readiness.canGenerate ? (
          <button
            type="button"
            className="readiness-check__primary"
            disabled={isGenerating}
            onClick={() => void handleGenerate()}
          >
            {isGenerating ? '生成中…' : '生成玩法'}
          </button>
        ) : primaryMissing?.action === 'open_flight' ? (
          <button
            type="button"
            className="readiness-check__primary"
            onClick={() => setLeftPanelMode('flight')}
          >
            去确认航班
          </button>
        ) : (
          <button
            type="button"
            className="readiness-check__primary"
            onClick={() => {
              if (primaryMissing) onPrefill(primaryMissing.hint);
            }}
          >
            用对话补全
          </button>
        )}
        {!readiness.canGenerate && !hasStayDone(readiness) && (
          <button
            type="button"
            className="readiness-check__secondary"
            onClick={() => setLeftPanelMode('stay')}
          >
            住宿片区
          </button>
        )}
      </div>
    </div>
  );
}

function hasStayDone(readiness: ReturnType<typeof derivePlanReadiness>): boolean {
  return readiness.items.find((i) => i.id === 'stay')?.done ?? false;
}
