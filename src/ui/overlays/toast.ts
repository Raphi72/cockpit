import { create } from 'zustand';

export type Toast = { id: number; message: string; tone: 'default' | 'danger' };

type ToastState = {
  toasts: Toast[];
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Message bref en bas de l'écran, qui disparaît seul. */
export function toast(message: string, tone: Toast['tone'] = 'default'): void {
  const id = nextId++;
  useToastStore.setState((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
  setTimeout(() => useToastStore.getState().dismiss(id), tone === 'danger' ? 6000 : 3500);
}
