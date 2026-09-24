import { addDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { daysBetween, isISODate, relativeDateLabel, toISODate } from '@/core/dates';
import type { Priority } from '@/domains/projects/model';
import type { PaletteKey } from '@/ui/data/ColorDot';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Terminé',
};

export type TaskItem = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: PaletteKey | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  /** « Prévue le » : quand je compte la faire. Alimente la vue Aujourd'hui. */
  scheduledDate: string | null;
  /** Deadline : quand elle doit être finie. */
  dueDate: string | null;
  estimateMin: number | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
};

export type TaskPatch = Partial<{
  title: string;
  notes: string | null;
  projectId: string | null;
  status: TaskStatus;
  priority: Priority;
  scheduledDate: string | null;
  dueDate: string | null;
  estimateMin: number | null;
}>;

// ─── Règles ─────────────────────────────────────────────────────────────────

const isOpen = (task: Pick<TaskItem, 'status'>) => task.status !== 'done';

/** En retard : non terminée et deadline passée. */
export function isTaskLate(task: Pick<TaskItem, 'status' | 'dueDate'>, today: string): boolean {
  return isOpen(task) && task.dueDate !== null && task.dueDate < today;
}

/**
 * Tâche du jour : non terminée, prévue aujourd'hui ou avant (report automatique),
 * ou dont la deadline est aujourd'hui ou passée.
 */
export function isTaskForToday(task: Pick<TaskItem, 'status' | 'scheduledDate' | 'dueDate'>, today: string): boolean {
  if (!isOpen(task)) return false;
  return (task.scheduledDate !== null && task.scheduledDate <= today) || (task.dueDate !== null && task.dueDate <= today);
}

/** Date qui situe la tâche dans le temps : « prévue le », sinon la deadline. */
export function effectiveDate(task: Pick<TaskItem, 'scheduledDate' | 'dueDate'>): string | null {
  return task.scheduledDate ?? task.dueDate;
}

export type TodayGroups = { overdue: TaskItem[]; today: TaskItem[] };

/** Vue Aujourd'hui : les retards d'abord, puis le reste, les plus prioritaires en tête. */
export function selectToday(open: TaskItem[], today: string): TodayGroups {
  const forToday = open.filter((t) => isTaskForToday(t, today)).sort(byPriorityThenOrder);
  return {
    overdue: forToday.filter((t) => isTaskLate(t, today)),
    today: forToday.filter((t) => !isTaskLate(t, today)),
  };
}

/** Vue 7 jours : tâches situées de demain à J+7, groupées par jour. */
export function selectUpcoming(open: TaskItem[], today: string): { date: string; tasks: TaskItem[] }[] {
  const limit = toISODate(addDays(parseISO(today), 7));
  const upcoming = open.filter((t) => {
    if (isTaskForToday(t, today)) return false;
    const date = effectiveDate(t);
    return date !== null && date > today && date <= limit;
  });
  const byDate = new Map<string, TaskItem[]>();
  for (const task of upcoming.sort(byPriorityThenOrder)) {
    const date = effectiveDate(task)!;
    byDate.set(date, [...(byDate.get(date) ?? []), task]);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, tasks]) => ({ date, tasks }));
}

export function selectOverdue(open: TaskItem[], today: string): TaskItem[] {
  return open.filter((t) => isTaskLate(t, today)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
}

/** Prioritaires : Haute et Urgente, puis par deadline. */
export function selectPriority(open: TaskItem[]): TaskItem[] {
  return open
    .filter((t) => t.priority >= 2)
    .sort((a, b) => b.priority - a.priority || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
}

/** Toutes : regroupées par projet, les tâches libres en dernier. */
export function groupByProject(tasks: TaskItem[]): { projectId: string | null; name: string; color: PaletteKey | null; tasks: TaskItem[] }[] {
  const groups = new Map<string, { projectId: string | null; name: string; color: PaletteKey | null; tasks: TaskItem[] }>();
  for (const task of tasks) {
    const key = task.projectId ?? '';
    const group = groups.get(key) ?? { projectId: task.projectId, name: task.projectName ?? 'Sans projet', color: task.projectColor, tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, tasks: g.tasks.sort((a, b) => a.sortOrder - b.sortOrder) }))
    .sort((a, b) => (a.projectId === null ? 1 : b.projectId === null ? -1 : a.name.localeCompare(b.name, 'fr')));
}

function byPriorityThenOrder(a: TaskItem, b: TaskItem): number {
  return b.priority - a.priority || a.sortOrder - b.sortOrder;
}

// ─── Affichage ──────────────────────────────────────────────────────────────

export type TaskDateLabel = { kind: 'due' | 'scheduled'; label: string; tone: 'late' | 'soon' | 'normal' };

/**
 * L'unique date affichée sur une ligne de tâche : la deadline si elle existe (en rouge si
 * dépassée, en ambre si proche), sinon la date prévue quand elle est dans le futur.
 */
export function taskDateLabel(
  task: Pick<TaskItem, 'status' | 'scheduledDate' | 'dueDate'>,
  today: string,
): TaskDateLabel | null {
  if (!isOpen(task)) return null;
  if (task.dueDate && isISODate(task.dueDate)) {
    const diff = daysBetween(today, task.dueDate);
    const tone = diff < 0 ? 'late' : diff <= 2 ? 'soon' : 'normal';
    return { kind: 'due', label: relativeDateLabel(task.dueDate, today), tone };
  }
  if (task.scheduledDate && task.scheduledDate > today) {
    return { kind: 'scheduled', label: relativeDateLabel(task.scheduledDate, today), tone: 'normal' };
  }
  return null;
}

/** « Demain », « Samedi 26 sept. » */
export function dayHeading(date: string, today: string): string {
  if (daysBetween(today, date) === 1) return 'Demain';
  const text = format(parseISO(date), 'EEEE d MMM', { locale: fr });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** 30 → « 30 min », 90 → « 1 h 30 », 120 → « 2 h » */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

export const ESTIMATE_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240, 480];

export function totalEstimate(tasks: Pick<TaskItem, 'estimateMin'>[]): number {
  return tasks.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0);
}

// ─── Ordre manuel ───────────────────────────────────────────────────────────

/** Valeur d'ordre entre deux voisins ; `undefined` si la précision est épuisée. */
export function sortOrderBetween(before?: number, after?: number): number | undefined {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  const middle = (before + after) / 2;
  return middle > before && middle < after ? middle : undefined;
}

/**
 * Déplace l'élément `from` à la position `to` et renvoie les ordres à enregistrer :
 * en général une seule ligne, ou toute la liste renumérotée si les valeurs sont trop serrées.
 */
export function computeReorder(
  items: { id: string; sortOrder: number }[],
  from: number,
  to: number,
): { id: string; sortOrder: number }[] {
  if (from === to || !items[from]) return [];
  const moved = [...items];
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item!);

  const next = sortOrderBetween(moved[to - 1]?.sortOrder, moved[to + 1]?.sortOrder);
  if (next === undefined) return moved.map((it, index) => ({ id: it.id, sortOrder: index + 1 }));
  return [{ id: item!.id, sortOrder: next }];
}

// ─── Création ───────────────────────────────────────────────────────────────

export type NewTaskInput = {
  title: string;
  projectId: string | null;
  scheduledDate: string | null;
  dueDate: string | null;
  priority: Priority;
  estimateMin: number | null;
  notes: string | null;
};

export function validateNewTask(input: NewTaskInput): Partial<Record<keyof NewTaskInput, string>> {
  const errors: Partial<Record<keyof NewTaskInput, string>> = {};
  if (input.title.trim() === '') errors.title = 'Donne un titre à la tâche.';
  if (input.scheduledDate && !isISODate(input.scheduledDate)) errors.scheduledDate = 'Date invalide.';
  if (input.dueDate && !isISODate(input.dueDate)) errors.dueDate = 'Deadline invalide.';
  return errors;
}

/** Début de la journée locale en horodatage UTC : sert à retrouver les tâches terminées aujourd'hui. */
export function startOfDayTimestamp(today: string): string {
  return new Date(`${today}T00:00:00`).toISOString();
}
