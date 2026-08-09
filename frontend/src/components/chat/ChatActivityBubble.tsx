import { useEffect, useState } from 'react';
import type { ChatActivitySession, ChatActivityStepStatus } from '../../types/chatActivity';
import './Chat.css';

interface ChatActivityBubbleProps {
  activity: ChatActivitySession;
}

function StatusMark({ status }: { status: ChatActivityStepStatus }) {
  return (
    <span
      className={`chat-activity__mark chat-activity__mark--${status}`}
      aria-hidden
    />
  );
}

export function ChatActivityBubble({ activity }: ChatActivityBubbleProps) {
  const [elapsed, setElapsed] = useState(0);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - activity.startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activity.startedAt, activity.id]);

  const reasoning = activity.reasoning?.trim();

  return (
    <div
      className={`chat-activity${activity.error ? ' chat-activity--error' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="chat-activity__head">
        <span className="chat-activity__title">{activity.title}</span>
        <span className="chat-activity__elapsed">{elapsed}s</span>
      </div>
      <ul className="chat-activity__steps">
        {activity.steps.map((step) => (
          <li
            key={step.id}
            className={`chat-activity__step chat-activity__step--${step.status}`}
          >
            <StatusMark status={step.status} />
            <span className="chat-activity__label">
              {step.label}
              {step.detail ? (
                <span className="chat-activity__detail"> · {step.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {reasoning && (
        <div className="chat-activity__reasoning">
          <button
            type="button"
            className="chat-activity__reasoning-toggle"
            aria-expanded={reasoningOpen}
            onClick={() => setReasoningOpen((v) => !v)}
          >
            {reasoningOpen ? '收起过程' : '展开过程'}
          </button>
          {reasoningOpen && (
            <pre className="chat-activity__reasoning-body">{reasoning.slice(0, 2000)}</pre>
          )}
        </div>
      )}
      {activity.error && <p className="chat-activity__error">{activity.error}</p>}
    </div>
  );
}
