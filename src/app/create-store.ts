import { create } from 'zustand';

/** Fenêtres de création globales, ouvrables depuis n'importe où (bouton « Nouveau », raccourcis…). */
export type CreateKind = 'task' | 'event' | 'project' | 'client' | 'payment' | 'transaction' | 'subject';

/** Contexte pré-rempli : depuis une fiche projet, la tâche (ou l'encaissement, la dépense) est rattachée à ce projet. */
export type CreateDefaults = {
  projectId?: string | null;
  scheduledDate?: string | null;
  /** Événement créé depuis le calendrier : jour ('YYYY-MM-DD') ou créneau ('YYYY-MM-DDTHH:MM') cliqué. */
  eventStart?: string;
  /** Clic dans la ligne « journée » d'un jour. */
  eventAllDay?: boolean;
  /**
   * Capture de la boîte de réception en train d'être triée (tâche ou événement) : son texte sert de
   * titre, et elle quitte la boîte quand la création aboutit.
   */
  inboxItem?: { id: string; text: string; createdAt: string };
};

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

/** Ces créations reprennent le projet de la fiche ouverte ; un projet ou un client part de zéro. */
const PROJECT_AWARE: CreateKind[] = ['task', 'event', 'payment', 'transaction'];

export function createDefaultsFor(kind: CreateKind, pathname: string, today: string): CreateDefaults {
  return PROJECT_AWARE.includes(kind) ? defaultsFromPath(pathname, today) : {};
}
