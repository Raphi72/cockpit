import { create } from 'zustand';

export type ToastAction = { label: string; onClick: () => void };

export type Toast = { id: number; message: string; tone: 'default' | 'danger'; action?: ToastAction };

type ToastState = {
  toasts: Toast[];
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Message bref en bas de l'écran, qui disparaît seul.
 * Avec `action`, propose un bouton (ex. « Annuler » après une suppression).
 */
export function toast(message: string, options: { tone?: Toast['tone']; action?: ToastAction } = {}): void {
  const id = nextId++;
  const tone = options.tone ?? 'default';
  useToastStore.setState((state) => ({ toasts: [...state.toasts, { id, message, tone, action: options.action }] }));
  const duration = options.action ? 6000 : tone === 'danger' ? 6000 : 3500;
  setTimeout(() => useToastStore.getState().dismiss(id), duration);
}
