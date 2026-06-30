import './Chat.css';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  isLoading,
  placeholder = '描述旅行需求…',
}: ChatComposerProps) {
  return (
    <div className="chat-composer">
      <textarea
        rows={1}
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
}
