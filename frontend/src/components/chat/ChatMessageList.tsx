import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { ChatMessage } from '../../types/travelPlan';
import type { ChatActivitySession } from '../../types/chatActivity';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatActivityBubble } from './ChatActivityBubble';
import './Chat.css';

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingContent?: string | null;
  activity?: ChatActivitySession | null;
  emptyHint?: string;
  footer?: ReactNode;
}

export function ChatMessageList({
  messages,
  streamingContent,
  activity,
  emptyHint,
  footer,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewHint, setShowNewHint] = useState(false);
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setShowNewHint(false);
    atBottomRef.current = true;
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    if (atBottom) setShowNewHint(false);
  };

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
    else setShowNewHint(true);
  }, [messages, streamingContent, activity, footer, scrollToBottom]);

  const isEmpty = messages.length === 0 && !streamingContent && !activity && !footer;

  return (
    <div className="chat-list-wrap">
      <div
        ref={scrollRef}
        className="chat-list"
        role="log"
        aria-live="polite"
        onScroll={handleScroll}
      >
        {isEmpty && emptyHint && <p className="chat-list__empty">{emptyHint}</p>}
        {messages.map((msg) => (
          <ChatMessageBubble key={msg.id} message={msg} />
        ))}
        {activity && <ChatActivityBubble activity={activity} />}
        {streamingContent != null && !activity && (
          <ChatMessageBubble
            message={{
              id: '__streaming__',
              role: 'assistant',
              content: streamingContent,
              created_at: '',
            }}
            streaming
          />
        )}
        {footer}
      </div>
      {showNewHint && (
        <button type="button" className="chat-list__new-hint" onClick={() => scrollToBottom(true)}>
          ↓ 新消息
        </button>
      )}
    </div>
  );
}
