import { addDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addDaysISO, daysBetween, isISODate, toISODate } from '@/core/dates';
import { deadlineStatus, relativeDayText, type DeadlineTone } from '@/core/deadline';
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
  /**
   * Début (« prévue le » dans le schéma) : quand je compte m'y mettre. À partir de ce jour, elle est
   * dans Aujourd'hui jusqu'à ce qu'elle soit faite ; avec une deadline, elle occupe la période entre les deux.
   */
  scheduledDate: string | null;
  /** Deadline : quand elle doit être finie. */
  dueDate: string | null;
  estimateMin: number | null;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
  /** Tâche parente (sous-tâche), sur un seul niveau : la parente sert aussi de catégorie. */
  parentId: string | null;
  parentTitle: string | null;
  /** Sous-tâches de cette tâche (calculé). */
  subtasksTotal: number;
  subtasksDone: number;
};

export type TaskPatch = Partial<{
  title: string;
  notes: string | null;
  projectId: string | null;
  parentId: string | null;
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

/** Date qui situe la tâche dans le temps : son début, sinon la deadline. */
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

/**
 * Tâches à faire situées un jour donné (début, sinon la deadline), pour naviguer de jour en jour.
 * Un jour à venir ne reprend pas ce qui est déjà dans Aujourd'hui (une deadline dépassée, par exemple).
 * Un jour passé montre ce qui y était prévu et n'est pas fait : c'est reporté dans Aujourd'hui.
 */
export function selectPlannedOn(open: TaskItem[], day: string, today: string): TaskItem[] {
  return open
    .filter((t) => isOpen(t) && effectiveDate(t) === day && (day <= today || !isTaskForToday(t, today)))
    .sort(byPriorityThenOrder);
}

/** Tâches qui commencent un jour à venir (« Prochains jours » du dashboard). */
export function selectStartingOn(open: TaskItem[], day: string, today: string): TaskItem[] {
  return open.filter((t) => isOpen(t) && t.scheduledDate === day && !isTaskForToday(t, today)).sort(byPriorityThenOrder);
}

/** Horizon de « À prévoir » : les deadlines des 7 prochains jours. */
export const TO_PLAN_DAYS = 7;

/**
 * « À prévoir » : tâches sans début dont la deadline approche (dans les 7 jours, pas aujourd'hui).
 * Elles ne sont pas dans Aujourd'hui (la deadline n'est pas un jour de travail), mais il faut leur
 * trouver un moment. La plus proche d'abord. Le jour de la deadline, elles passent dans Aujourd'hui.
 */
export function selectToPlan(open: TaskItem[], today: string, days = TO_PLAN_DAYS): TaskItem[] {
  const limit = addDaysISO(today, days);
  return open
    .filter((t) => isOpen(t) && t.scheduledDate === null && t.dueDate !== null && t.dueDate > today && t.dueDate <= limit)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || byPriorityThenOrder(a, b));
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

export type TaskDateLabel = { kind: 'due' | 'scheduled'; label: string; tone: DeadlineTone };

/**
 * L'unique date affichée sur une ligne de tâche : la deadline si elle existe, avec son texte
 * calculé (« En retard de 2 jours », « Aujourd'hui », « Dans 3 jours »…, voir core/deadline.ts),
 * sinon le début quand il est à venir (« Demain », « Dans 4 jours »), sans couleur.
 */
export function taskDateLabel(
  task: Pick<TaskItem, 'status' | 'scheduledDate' | 'dueDate'>,
  today: string,
): TaskDateLabel | null {
  if (!isOpen(task)) return null;
  if (task.dueDate && isISODate(task.dueDate)) {
    const { text, tone } = deadlineStatus(task.dueDate, today);
    return { kind: 'due', label: text, tone };
  }
  if (task.scheduledDate && task.scheduledDate > today) {
    return { kind: 'scheduled', label: relativeDayText(task.scheduledDate, today), tone: 'later' };
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

// ─── Sous-tâches ────────────────────────────────────────────────────────────

/**
 * Une tâche peut devenir sous-tâche de `candidate` : un seul niveau (la candidate n'est pas
 * elle-même une sous-tâche, et la tâche n'a pas de sous-tâches), dans le même projet (ou toutes
 * deux libres), et jamais d'elle-même.
 */
export function canBeParentOf(
  candidate: Pick<TaskItem, 'id' | 'parentId' | 'projectId'>,
  task: Pick<TaskItem, 'id' | 'projectId' | 'subtasksTotal'>,
): boolean {
  return (
    candidate.id !== task.id &&
    candidate.parentId === null &&
    task.subtasksTotal === 0 &&
    candidate.projectId === task.projectId
  );
}

export type TaskNode = { task: TaskItem; children: TaskItem[] };

/**
 * Liste des tâches d'un projet en arbre : les tâches ouvertes du premier niveau, chacune suivie de
 * toutes ses sous-tâches (les faites restent sous leur parente, barrées) ; puis, à part, les tâches
 * terminées du premier niveau et leurs sous-tâches. L'ordre manuel est respecté à chaque niveau.
 */
export function projectTaskTree(tasks: TaskItem[]): { open: TaskNode[]; done: TaskItem[] } {
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = new Set(sorted.map((t) => t.id));
  const isTop = (t: TaskItem) => t.parentId === null || !ids.has(t.parentId);
  const childrenOf = (id: string) => sorted.filter((t) => t.parentId === id);
  const top = sorted.filter(isTop);
  return {
    open: top.filter(isOpen).map((task) => ({ task, children: childrenOf(task.id) })),
    done: top.filter((t) => !isOpen(t)).flatMap((task) => [task, ...childrenOf(task.id)]),
  };
}

/**
 * Pour une liste à plat (vues globales) : chaque sous-tâche dont la parente est dans la liste
 * passe juste sous elle, en retrait. Les autres restent à leur place.
 */
export function nestTasks(tasks: TaskItem[]): { task: TaskItem; depth: 0 | 1 }[] {
  const ids = new Set(tasks.map((t) => t.id));
  const nested = (t: TaskItem) => t.parentId !== null && ids.has(t.parentId);
  return tasks
    .filter((t) => !nested(t))
    .flatMap((task) => [
      { task, depth: 0 as const },
      ...tasks.filter((t) => t.parentId === task.id).map((child) => ({ task: child, depth: 1 as const })),
    ]);
}

/** Avancement d'une liste : une tâche qui a des sous-tâches ne compte pas, ses sous-tâches si. */
export function leafProgress(tasks: TaskItem[]): { done: number; total: number } {
  const leaves = tasks.filter((t) => t.subtasksTotal === 0);
  return { done: leaves.filter((t) => !isOpen(t)).length, total: leaves.length };
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

// ─── Glisser-déposer dans la fiche projet ───────────────────────────────────

/**
 * Où l'on dépose dans l'arbre des tâches d'un projet : avant ou après une ligne, dans une tâche
 * (la déposée devient sa sous-tâche), ou en fin de liste.
 */
export type TreeDrop = { position: 'before' | 'after' | 'inside'; targetId: string } | { position: 'end' };

/** Nouvelle place : la parente (`null` : premier niveau) et les ordres à enregistrer, la tâche déplacée comprise. */
export type TreePlacement = { parentId: string | null; orders: { id: string; sortOrder: number }[] };

/** Identifiant, dans `orders`, d'une tâche qui n'existe pas encore (une idée qui devient une tâche). */
export const NEW_TASK_ID = '';

/**
 * Place une tâche (ou une idée qui en devient une : `moved.id === NEW_TASK_ID`) dans l'arbre d'un
 * projet (voir projectTaskTree). Renvoie `null` si le dépôt ne change rien ou n'est pas permis :
 * un seul niveau de sous-tâches (une tâche qui en a ne descend pas, rien ne se range dans une
 * sous-tâche), et jamais sur elle-même. En général, seule la tâche déplacée reçoit un nouvel ordre ;
 * si les valeurs sont trop serrées, ses nouvelles sœurs sont renumérotées.
 */
export function placeInTree(nodes: TaskNode[], moved: { id: string; hasSubtasks: boolean }, drop: TreeDrop): TreePlacement | null {
  const top = nodes.map((node) => node.task);
  const siblingsOf = (parentId: string | null) =>
    parentId === null ? top : (nodes.find((node) => node.task.id === parentId)?.children ?? []);
  const locate = (id: string): { parentId: string | null } | null => {
    if (top.some((t) => t.id === id)) return { parentId: null };
    const parent = nodes.find((node) => node.children.some((c) => c.id === id));
    return parent ? { parentId: parent.task.id } : null;
  };

  let parentId: string | null = null;
  let targetIndex: (list: TaskItem[]) => number = (list) => list.length;
  if (drop.position !== 'end') {
    const target = locate(drop.targetId);
    if (!target || drop.targetId === moved.id) return null;
    if (drop.position === 'inside') {
      if (target.parentId !== null || moved.hasSubtasks) return null;
      parentId = drop.targetId;
    } else {
      if (target.parentId !== null && moved.hasSubtasks) return null;
      parentId = target.parentId;
      const after = drop.position === 'after' ? 1 : 0;
      targetIndex = (list) => list.findIndex((t) => t.id === drop.targetId) + after;
    }
  }

  const all = siblingsOf(parentId);
  const list = all.filter((t) => t.id !== moved.id);
  const index = targetIndex(list);
  // Même place qu'avant : rien à faire.
  if (all.findIndex((t) => t.id === moved.id) === index && all.length !== list.length) return null;

  const next = sortOrderBetween(list[index - 1]?.sortOrder, list[index]?.sortOrder);
  if (next !== undefined) return { parentId, orders: [{ id: moved.id, sortOrder: next }] };
  const ids = [...list.slice(0, index).map((t) => t.id), moved.id, ...list.slice(index).map((t) => t.id)];
  return { parentId, orders: ids.map((id, i) => ({ id, sortOrder: i + 1 })) };
}

export type TreeKey = 'up' | 'down' | 'indent' | 'outdent';

/**
 * Déplacements au clavier dans l'arbre, avec Alt : ↑ ↓ changent de place parmi les sœurs,
 * → range la tâche dans celle du dessus (sous-tâche), ← la sort de sa parente (juste après elle).
 */
export function keyboardDrop(nodes: TaskNode[], taskId: string, key: TreeKey): TreeDrop | null {
  const parent = nodes.find((node) => node.children.some((c) => c.id === taskId));
  const siblings = parent ? parent.children : nodes.map((node) => node.task);
  const index = siblings.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  switch (key) {
    case 'up':
      return index > 0 ? { position: 'before', targetId: siblings[index - 1]!.id } : null;
    case 'down':
      return index < siblings.length - 1 ? { position: 'after', targetId: siblings[index + 1]!.id } : null;
    case 'indent':
      return !parent && index > 0 ? { position: 'inside', targetId: siblings[index - 1]!.id } : null;
    case 'outdent':
      return parent ? { position: 'after', targetId: parent.task.id } : null;
  }
}

// ─── Création ───────────────────────────────────────────────────────────────

export type NewTaskInput = {
  title: string;
  projectId: string | null;
  /** Sous-tâche : elle rejoint le projet de sa parente. */
  parentId?: string | null;
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
