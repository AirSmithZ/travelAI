import { useState } from 'react';
import type { ChatMessage } from '../../types/travelPlan';
import { PatchConfirmCard } from './PatchConfirmCard';
import './Chat.css';

const COLLAPSE_THRESHOLD = 500;

const PATCH_STATUS_LABEL: Record<string, string> = {
  applied: '已确认',
  rejected: '已忽略',
  pending: '待确认',
};

interface ChatMessageBubbleProps {
  message: ChatMessage;
  streaming?: boolean;
}

export function ChatMessageBubble({ message, streaming }: ChatMessageBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = !streaming && message.content.length > COLLAPSE_THRESHOLD;
  const displayContent =
    isLong && !expanded ? `${message.content.slice(0, COLLAPSE_THRESHOLD)}…` : message.content;

  const hasPatches = !streaming && message.patches && message.patches.length > 0;
  const patchStatus = message.patch_status;

  return (
    <div className="chat-msg-group">
      <div
        className={`chat-msg chat-msg--${message.role}`}
        data-role={message.role}
      >
        {displayContent}
        {streaming && <span className="chat-msg__cursor" aria-hidden>▍</span>}
        {isLong && (
          <button
            type="button"
            className="chat-msg__expand"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '收起' : '展开全文'}
          </button>
        )}
      </div>

      {hasPatches && (
        <div className="chat-msg__patches" role="group" aria-label="解析修改项">
          {message.patches!.map((patch) => (
            <PatchConfirmCard key={patch.id} patch={patch} variant="summary" />
          ))}
          {patchStatus && patchStatus !== 'pending' && (
            <span className={`chat-msg__patch-badge chat-msg__patch-badge--${patchStatus}`}>
              {PATCH_STATUS_LABEL[patchStatus]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
