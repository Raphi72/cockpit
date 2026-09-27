import { daysBetween } from '@/core/dates';
import { byPriorityThenOrder, formatDuration, isTaskForToday, isTaskLate, type TaskItem } from './model';

/**
 * « Je veux travailler… » : l'app compose le programme du jour, pour une durée (les estimations
 * choisies n'en dépassent jamais le total) ou pour un nombre de tâches. Les tâches choisies sont
 * dans Aujourd'hui ce jour-là seulement (`plannedOn`) : celles qui ne sont pas faites retrouvent leur
 * place le lendemain, puisque leurs dates n'ont pas changé.
 */

export type PlanMode = 'duration' | 'count';

/** Ce que l'on demande : une durée (en minutes) ou un nombre de tâches. Les deux sont gardés d'une fois à l'autre. */
export type PlanRequest = { mode: PlanMode; minutes: number; count: number };

export const DEFAULT_PLAN_REQUEST: PlanRequest = { mode: 'duration', minutes: 120, count: 3 };

/** Durées proposées d'un clic ; « − » et « + » ajustent par quart d'heure. */
export const PLAN_DURATIONS = [30, 60, 120, 240];
export const PLAN_DURATION_STEP = 15;
export const PLAN_DURATION_MIN = 15;
export const PLAN_DURATION_MAX = 10 * 60;
export const PLAN_COUNT_MIN = 1;
export const PLAN_COUNT_MAX = 10;

/** Une valeur venue du stockage local (modifiée à la main…) retombe dans les bornes. */
export function resolvePlanRequest(value: unknown): PlanRequest {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof PlanRequest, unknown>>;
  const clamp = (n: unknown, min: number, max: number, fallback: number) =>
    typeof n === 'number' && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return {
    mode: v.mode === 'count' ? 'count' : 'duration',
    minutes: clamp(v.minutes, PLAN_DURATION_MIN, PLAN_DURATION_MAX, DEFAULT_PLAN_REQUEST.minutes),
    count: clamp(v.count, PLAN_COUNT_MIN, PLAN_COUNT_MAX, DEFAULT_PLAN_REQUEST.count),
  };
}

/** Durée suivante ou précédente, au quart d'heure, dans les bornes. */
export function stepDuration(minutes: number, direction: 1 | -1): number {
  const next = (Math.round(minutes / PLAN_DURATION_STEP) + direction) * PLAN_DURATION_STEP;
  return Math.min(PLAN_DURATION_MAX, Math.max(PLAN_DURATION_MIN, next));
}

/**
 * Tâches qu'on peut mettre au programme : à faire, sans sous-tâches (une catégorie n'est pas une
 * chose à faire ; ses sous-tâches le sont) et hors des projets en pause.
 */
export function planCandidates(open: TaskItem[], pausedProjectIds: ReadonlySet<string>): TaskItem[] {
  return open.filter(
    (t) => t.status !== 'done' && t.subtasksTotal === 0 && (t.projectId === null || !pausedProjectIds.has(t.projectId)),
  );
}

/**
 * Ordre de préférence, par paliers : 0, en retard ou dû aujourd'hui ; 1, prévu aujourd'hui (ou
 * avant), dû dans les 3 jours ou urgent ; 2, haute priorité ou dû dans la semaine ; 3, le reste.
 */
export function planTier(task: TaskItem, today: string): 0 | 1 | 2 | 3 {
  const dueIn = task.dueDate ? daysBetween(today, task.dueDate) : null;
  if (isTaskLate(task, today) || dueIn === 0) return 0;
  const startedOrSoon = (task.scheduledDate !== null && task.scheduledDate <= today) || (dueIn !== null && dueIn <= 3);
  if (startedOrSoon || task.priority === 3) return 1;
  if (task.priority === 2 || (dueIn !== null && dueIn <= 7)) return 2;
  return 3;
}

/**
 * Les tâches dans l'ordre où le programme les prend : par palier (planTier), puis la deadline la
 * plus proche, la priorité, le début le plus ancien et l'ordre manuel.
 */
export function rankForPlan(tasks: TaskItem[], today: string): TaskItem[] {
  const last = '9999-12-31';
  return tasks
    .map((task) => ({ task, tier: planTier(task, today) }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.task.dueDate ?? last).localeCompare(b.task.dueDate ?? last) ||
        b.task.priority - a.task.priority ||
        (a.task.scheduledDate ?? last).localeCompare(b.task.scheduledDate ?? last) ||
        a.task.sortOrder - b.task.sortOrder,
    )
    .map(({ task }) => task);
}

export type PlanProposal = {
  tasks: TaskItem[];
  /** Total des estimations choisies. */
  minutes: number;
  /**
   * Mode durée : tâches laissées de côté faute d'estimation (on ne peut pas savoir si elles
   * tiennent), dans l'ordre de préférence : leur donner une durée les fait entrer dans le calcul.
   */
  unestimated: TaskItem[];
};

/**
 * Programme proposé, sans les tâches écartées (`excluded` : « pas celle-ci », « autre proposition »).
 * - Durée : dans l'ordre de préférence, chaque tâche estimée qui tient dans le temps restant ; une
 *   tâche trop longue est sautée et une plus courte, plus loin, peut la remplacer. Le total ne
 *   dépasse jamais la durée : pour 2 h et deux tâches de 1 h 30, une seule est proposée.
 * - Nombre : les premières tâches dans l'ordre de préférence, estimées ou non.
 */
export function proposePlan(
  candidates: TaskItem[],
  request: PlanRequest,
  today: string,
  excluded: ReadonlySet<string> = new Set(),
): PlanProposal {
  const ranked = rankForPlan(
    candidates.filter((t) => !excluded.has(t.id)),
    today,
  );
  if (request.mode === 'count') {
    const tasks = ranked.slice(0, request.count);
    return { tasks, minutes: tasks.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0), unestimated: [] };
  }
  const tasks: TaskItem[] = [];
  let left = request.minutes;
  for (const task of ranked) {
    if (task.estimateMin !== null && task.estimateMin <= left) {
      tasks.push(task);
      left -= task.estimateMin;
    }
  }
  return {
    tasks,
    minutes: request.minutes - left,
    unestimated: ranked.filter((t) => t.estimateMin === null),
  };
}

/** Tâches du jour avec le programme à part : le programme d'abord (dans son ordre), puis les retards et le reste. */
export function selectTodayPlan(open: TaskItem[], today: string): { planned: TaskItem[]; overdue: TaskItem[]; today: TaskItem[] } {
  const planned = rankForPlan(
    open.filter((t) => t.status !== 'done' && t.plannedOn === today),
    today,
  );
  const rest = open.filter((t) => t.plannedOn !== today && isTaskForToday(t, today)).sort(byPriorityThenOrder);
  return {
    planned,
    overdue: rest.filter((t) => isTaskLate(t, today)),
    today: rest.filter((t) => !isTaskLate(t, today)),
  };
}

/** « 1 h 45 sur 2 h », « 3 tâches · ~1 h 30 » : ce que le programme proposé représente. */
export function proposalSummary(proposal: PlanProposal, request: PlanRequest): string {
  const count = proposal.tasks.length;
  if (request.mode === 'duration') return `${formatDuration(proposal.minutes)} sur ${formatDuration(request.minutes)}`;
  const tasks = `${count} tâche${count > 1 ? 's' : ''}`;
  return proposal.minutes > 0 ? `${tasks} · ~${formatDuration(proposal.minutes)} estimées` : tasks;
}
