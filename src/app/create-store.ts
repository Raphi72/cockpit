import { create } from 'zustand';

/** Fenêtres de création globales, ouvrables depuis n'importe où (bouton « Nouveau », raccourcis…). */
export type CreateKind = 'project' | 'client';

type CreateState = {
  open: CreateKind | null;
  openCreate: (kind: CreateKind) => void;
  close: () => void;
};

export const useCreateStore = create<CreateState>()((set) => ({
  open: null,
  openCreate: (kind) => set({ open: kind }),
  close: () => set({ open: null }),
}));
