import { forwardRef, useImperativeHandle, useRef } from 'react';
import './Chat.css';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export type ChatComposerHandle = {
  focus: () => void;
};

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    {
      value,
      onChange,
      onSubmit,
      disabled,
      isLoading,
      placeholder = '描述旅行需求…',
    },
    ref,
  ) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({
      focus: () => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
      },
    }));

    return (
      <div className="chat-composer">
        <textarea
          ref={taRef}
          rows={2}
          placeholder={placeholder}
          value={value}
          disabled={disabled || isLoading}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || disabled || isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? '…' : '发送'}
        </button>
      </div>
    );
  },
);
