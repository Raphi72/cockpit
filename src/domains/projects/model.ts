import { daysBetween, isISODate } from '@/core/dates';
import type { ClientChoice } from '@/domains/clients/model';
import type { PaletteKey } from '@/ui/data/ColorDot';

export type { ClientChoice };

// ─── Référentiels ───────────────────────────────────────────────────────────

/** Catégorie de projet personnalisable (Freelance, Mission, Personnel…). */
export type ProjectType = {
  id: string;
  name: string;
  color: PaletteKey;
  sortOrder: number;
};

export type ProjectTypeWithUsage = ProjectType & { projectCount: number };

export type ProjectStatus = 'proposal' | 'planned' | 'active' | 'on_hold' | 'done' | 'cancelled';

/** Ordre d'affichage des statuts, du plus « vivant » au plus terminé. */
export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'planned', 'proposal', 'on_hold', 'done', 'cancelled'];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  proposal: 'Proposition',
  planned: 'À venir',
  active: 'En cours',
  on_hold: 'En pause',
  done: 'Terminé',
  cancelled: 'Annulé',
};

export const OPEN_STATUSES: ProjectStatus[] = ['active', 'planned', 'proposal', 'on_hold'];
/**
 * Projets ouverts et validés : une Proposition (devis pas encore signé) n'a sa place
 * ni sur le dashboard ni dans le calendrier. Elle reste dans la page Projets.
 */
export const CONFIRMED_STATUSES: ProjectStatus[] = ['active', 'planned', 'on_hold'];
export const CLOSED_STATUSES: ProjectStatus[] = ['done', 'cancelled'];

export type Priority = 0 | 1 | 2 | 3;

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'Basse',
  1: 'Normale',
  2: 'Haute',
  3: 'Urgente',
};

// ─── Projets ────────────────────────────────────────────────────────────────

export type ProjectListItem = {
  id: string;
  name: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  deadline: string | null;
  budgetCents: number | null;
  typeId: string;
  typeName: string;
  typeColor: PaletteKey;
  clientId: string | null;
  clientName: string | null;
  tasksTotal: number;
  tasksDone: number;
  receivedCents: number;
  scheduledCents: number;
};

export type ProjectDetail = ProjectListItem & {
  description: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
};

/** Champs modifiables d'un projet (édition sur place). */
export type ProjectPatch = Partial<{
  name: string;
  description: string | null;
  notes: string | null;
  clientId: string | null;
  typeId: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  deadline: string | null;
  budgetCents: number | null;
}>;

/** Progression automatique : tâches terminées / tâches totales. `null` s'il n'y a aucune tâche. */
export function projectProgress(project: Pick<ProjectListItem, 'status' | 'tasksTotal' | 'tasksDone'>): number | null {
  if (project.status === 'done') return 100;
  if (project.tasksTotal === 0) return null;
  return Math.round((project.tasksDone * 100) / project.tasksTotal);
}

export type DeadlineTone = 'late' | 'soon' | 'normal';

/** En retard si la deadline est passée ; « bientôt » à 3 jours ou moins. Jamais pour un projet clos. */
export function deadlineTone(
  project: Pick<ProjectListItem, 'deadline' | 'status'>,
  today: string,
): DeadlineTone | null {
  if (!project.deadline) return null;
  if (CLOSED_STATUSES.includes(project.status)) return 'normal';
  const diff = daysBetween(today, project.deadline);
  if (diff < 0) return 'late';
  if (diff <= 3) return 'soon';
  return 'normal';
}

export type ProjectMoney = {
  budget: number;
  received: number;
  remaining: number;
  percentPaid: number;
  /** Part du budget qui n'a encore aucune échéance. */
  unplanned: number;
};

export function projectMoney(
  project: Pick<ProjectListItem, 'budgetCents' | 'receivedCents' | 'scheduledCents'>,
): ProjectMoney {
  const budget = project.budgetCents ?? 0;
  return {
    budget,
    received: project.receivedCents,
    remaining: Math.max(budget - project.receivedCents, 0),
    percentPaid: budget > 0 ? Math.min(100, Math.round((project.receivedCents * 100) / budget)) : 0,
    unplanned: Math.max(budget - project.scheduledCents, 0),
  };
}

// ─── Création ───────────────────────────────────────────────────────────────

export type SchedulePreset = 'single' | 'deposit30' | 'half' | 'later';

export const SCHEDULE_PRESET_LABELS: Record<SchedulePreset, string> = {
  single: 'En une fois',
  deposit30: 'Acompte 30 %',
  half: '50 / 50',
  later: 'Plus tard',
};

export type ScheduledPayment = { label: string; amountCents: number; dueDate: string | null };

/**
 * Échéancier proposé à la création (P3). Le premier versement tombe au début du projet
 * (ou aujourd'hui), le solde à la deadline. Les montants tombent toujours juste au centime.
 */
export function buildSchedule(
  preset: SchedulePreset,
  budgetCents: number,
  dates: { startDate: string | null; deadline: string | null; today: string },
): ScheduledPayment[] {
  if (preset === 'later' || budgetCents <= 0) return [];
  const first = dates.startDate ?? dates.today;
  const single: ScheduledPayment[] = [{ label: 'Paiement', amountCents: budgetCents, dueDate: dates.deadline }];

  if (preset === 'single') return single;

  // Acompte arrondi à l'euro pour rester lisible ; le solde absorbe la différence.
  const firstAmount =
    preset === 'deposit30' ? Math.round((budgetCents * 0.3) / 100) * 100 : Math.round(budgetCents / 200) * 100;
  if (firstAmount <= 0 || firstAmount >= budgetCents) return single;

  return [
    { label: preset === 'deposit30' ? 'Acompte 30 %' : 'Premier versement', amountCents: firstAmount, dueDate: first },
    { label: 'Solde', amountCents: budgetCents - firstAmount, dueDate: dates.deadline },
  ];
}

export type NewProjectInput = {
  name: string;
  typeId: string;
  client: ClientChoice;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  deadline: string | null;
  budgetCents: number | null;
  schedule: SchedulePreset;
  description: string | null;
};

/** Renvoie un message par champ invalide (vide si tout est bon). */
export function validateNewProject(input: NewProjectInput): Partial<Record<keyof NewProjectInput, string>> {
  const errors: Partial<Record<keyof NewProjectInput, string>> = {};
  if (input.name.trim() === '') errors.name = 'Donne un nom au projet.';
  if (input.startDate && !isISODate(input.startDate)) errors.startDate = 'Date de début invalide.';
  if (input.deadline && !isISODate(input.deadline)) {
    errors.deadline = 'Deadline invalide.';
  } else if (input.startDate && input.deadline && input.deadline < input.startDate) {
    errors.deadline = 'La deadline est avant la date de début.';
  }
  if (input.client.kind === 'new' && input.client.name.trim() === '') errors.client = 'Nom du client vide.';
  return errors;
}
