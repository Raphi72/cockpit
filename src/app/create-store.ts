import { create } from 'zustand';

/** Fenêtres de création globales, ouvrables depuis n'importe où (bouton « Nouveau », raccourcis…). */
export type CreateKind =
  | 'task'
  | 'homework'
  | 'event'
  | 'project'
  | 'client'
  | 'payment'
  | 'transaction'
  | 'subject'
  | 'class'
  | 'exam'
  | 'grade'
  | 'page';

/** Contexte pré-rempli : depuis une fiche projet, la tâche (ou l'encaissement, la dépense) est rattachée à ce projet. */
export type CreateDefaults = {
  projectId?: string | null;
  /** Devoir créé depuis la fiche d'une matière : il y est rattaché. */
  subjectId?: string | null;
  scheduledDate?: string | null;
  /** Devoir : le jour où il est à rendre. */
  dueDate?: string | null;
  /** Devoir à rendre pour un cours précis de Google Agenda ('agenda|événement'). */
  courseEvent?: string | null;
  /** Note saisie depuis un examen passé : l'examen, et son jour comme date de la note. */
  examId?: string | null;
  gradeDate?: string;
  /** Événement créé depuis le calendrier : jour ('YYYY-MM-DD') ou créneau ('YYYY-MM-DDTHH:MM') cliqué. */
  eventStart?: string;
  /** Clic dans la ligne « journée » d'un jour. */
  eventAllDay?: boolean;
  /**
   * Ligne d'une page qu'on transforme (clic droit) : son texte sert de titre ; quand la création
   * aboutit, `onCreated` retire la ligne de la page et annonce la création (avec « Annuler »).
   */
  fromLine?: { text: string; onCreated: (created: CreatedFromLine) => void };
};

/** Ce qu'une ligne de page est devenue : de quoi l'annoncer, et l'annuler. */
export type CreatedFromLine = { kind: 'task' | 'event' | 'project' | 'idea'; id: string; message: string };

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

/** Sur la fiche d'une matière, ce qu'on crée (devoir, examen, note, cours) lui est rattaché. */
export function subjectFromPath(pathname: string): string | null {
  return /^\/subjects\/([^/]+)$/.exec(pathname)?.[1] ?? null;
}

export function createDefaultsFor(kind: CreateKind, pathname: string, today: string): CreateDefaults {
  // Une page créée depuis une fiche (projet, matière) y est rattachée.
  if (kind === 'page') return { projectId: defaultsFromPath(pathname, today).projectId ?? null, subjectId: subjectFromPath(pathname) };
  if (kind === 'homework' || kind === 'class' || kind === 'exam' || kind === 'grade') return { subjectId: subjectFromPath(pathname) };
  return PROJECT_AWARE.includes(kind) ? defaultsFromPath(pathname, today) : {};
}
