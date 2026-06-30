import { useToastStore } from '../../stores/useToastStore';
import { Toast } from './Toast';

/** 全局单例 Toast，避免 ChatPanel / AppShell 叠层（P75） */
export function GlobalToast() {
  const message = useToastStore((s) => s.message);
  const variant = useToastStore((s) => s.variant);
  const clear = useToastStore((s) => s.clear);

  if (!message) return null;

  return <Toast message={message} variant={variant} onClose={clear} />;
}
