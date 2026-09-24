import { create } from 'zustand';

/** Fenêtres de création globales, ouvrables depuis n'importe où (bouton « Nouveau », raccourcis…). */
export type CreateKind = 'task' | 'project' | 'client';

/** Contexte pré-rempli : depuis une fiche projet, la tâche est rattachée à ce projet. */
export type CreateDefaults = { projectId?: string | null; scheduledDate?: string | null };

type CreateState = {
  open: { kind: CreateKind; defaults: CreateDefaults } | null;
  openCreate: (kind: CreateKind, defaults?: CreateDefaults) => void;
  close: () => void;
};

export const useCreateStore = create<CreateState>()((set) => ({
  open: null,
  openCreate: (kind, defaults = {}) => set({ open: { kind, defaults } }),
  close: () => set({ open: null }),
}));

/**
 * Contexte de création déduit de la page courante : sur une fiche projet, la tâche va dans
 * ce projet (sans date) ; ailleurs, c'est une tâche libre prévue aujourd'hui.
 */
export function defaultsFromPath(pathname: string, today: string): CreateDefaults {
  const match = /^\/projects\/([^/]+)$/.exec(pathname);
  return match ? { projectId: match[1] ?? null, scheduledDate: null } : { projectId: null, scheduledDate: today };
}
