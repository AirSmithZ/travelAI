import { create } from 'zustand';

type ToastVariant = 'info' | 'warning';

interface ToastState {
  message: string | null;
  variant: ToastVariant;
  show: (message: string, variant?: ToastVariant) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: 'info',
  show: (message, variant = 'info') => set({ message, variant }),
  clear: () => set({ message: null }),
}));
