import { useEffect } from 'react';
import './Toast.css';

interface ToastProps {
  message: string;
  variant?: 'info' | 'warning';
  onClose: () => void;
  durationMs?: number;
}

export function Toast({ message, variant = 'info', onClose, durationMs = 4500 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onClose]);

  return (
    <div className={`toast toast--${variant}`} role="status" aria-live="polite">
      <span className="toast__text">{message}</span>
      <button type="button" className="toast__close" onClick={onClose} aria-label="关闭">
        ×
      </button>
    </div>
  );
}
