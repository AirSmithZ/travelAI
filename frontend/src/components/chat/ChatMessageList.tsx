import { useRef, useEffect, useState, useCallback } from 'react';
import type { ChatMessage } from '../../types/travelPlan';
import { ChatMessageBubble } from './ChatMessageBubble';
import './Chat.css';

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingContent?: string | null;
  emptyHint?: string;
}

export function ChatMessageList({
  messages,
  streamingContent,
  emptyHint,
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
  }, [messages, streamingContent, scrollToBottom]);

  const isEmpty = messages.length === 0 && !streamingContent;

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
        {streamingContent != null && (
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
      </div>
      {showNewHint && (
        <button type="button" className="chat-list__new-hint" onClick={() => scrollToBottom(true)}>
          ↓ 新消息
        </button>
      )}
    </div>
  );
}
