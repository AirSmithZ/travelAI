import { useEffect, useState } from 'react';
import type { ChatActivitySession } from '../../types/chatActivity';
import './Chat.css';

interface ChatActivityBubbleProps {
  activity: ChatActivitySession;
}

function statusMark(status: ChatActivitySession['steps'][0]['status']): string {
  switch (status) {
    case 'done':
      return '✓';
    case 'running':
      return '…';
    case 'error':
      return '✗';
    case 'skipped':
      return '○';
    default:
      return '○';
  }
}

export function ChatActivityBubble({ activity }: ChatActivityBubbleProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - activity.startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activity.startedAt, activity.id]);

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
            <span className="chat-activity__mark" aria-hidden>
              {statusMark(step.status)}
            </span>
            <span className="chat-activity__label">
              {step.label}
              {step.detail ? ` · ${step.detail}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {activity.error && <p className="chat-activity__error">{activity.error}</p>}
      <span className="chat-activity__cursor" aria-hidden>
        ▍
      </span>
    </div>
  );
}
