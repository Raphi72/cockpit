import { addDaysISO, daysBetween } from '@/core/dates';
import { DEFAULT_TASK_MIN, blockDuration, type DayBlock } from '@/domains/day/model';
import type { ProjectListItem } from '@/domains/projects/model';
import type { TaskItem } from '@/domains/tasks/model';
import type { PlanningPeriod } from './model';

/**
 * Charge par semaine du planning (26/11/2026) : le travail à faire avant les deadlines, face au temps
 * posé dans la Journée. Rien n'est stocké : tout part des tâches, des projets et des blocs.
 */

export type LoadTask = Pick<
  TaskItem,
  | 'id'
  | 'projectId'
  | 'projectName'
  | 'subjectId'
  | 'status'
  | 'subtasksTotal'
  | 'scheduledDate'
  | 'dueDate'
  | 'estimateMin'
  | 'blockDate'
>;

export type LoadProject = Pick<ProjectListItem, 'id' | 'startDate' | 'deadline'>;

export type LoadBlock = Pick<DayBlock, 'date' | 'startsAt' | 'endsAt' | 'mode' | 'status'>;

/** Une tâche comptée dans la charge : ses minutes, réparties sur [from, to] (jours inclus). */
export type TaskSpread = {
  task: LoadTask;
  minutes: number;
  from: string;
  to: string;
  /** Deadline passée : tout compte aujourd'hui. */
  late: boolean;
  /** Rangée dans un bloc de la Journée (aujourd'hui ou plus tard) : elle compte le jour du bloc. */
  placed: boolean;
  /** Sans estimation : comptée 30 minutes, comme dans un bloc. */
  estimated: boolean;
};

/** Le travail laissé de côté faute de deadline, pour un projet (`projectId` nul : sans projet). */
export type UndatedShare = { projectId: string | null; name: string | null; count: number; minutes: number };

export type LoadSpreads = {
  spreads: TaskSpread[];
  /**
   * Tâches sans deadline (ni la leur, ni celle du projet) et hors des blocs à venir : elles ne comptent
   * pas. Par projet, dans l'ordre où on les rencontre, sans projet en dernier.
   */
  undated: UndatedShare[];
  /** Travail restant de chaque projet, deadline ou pas (clé : id du projet). */
  remaining: Map<string, { minutes: number; unestimated: number }>;
};

/**
 * Les tâches qui comptent : à faire, du mode Travail (pas les devoirs), sans sous-tâches (une tâche qui
 * en a sert de catégorie : ce sont elles qui comptent), sans projet ou d'un projet en cours ou à venir
 * (`projects`). Chacune compte son estimation, ou 30 minutes sans estimation.
 *
 * Où elle compte : rangée dans un bloc d'aujourd'hui ou plus tard, le jour du bloc. Sinon, répartie
 * jour par jour d'aujourd'hui (ou de son début, ou de celui du projet, s'il est plus tard) à sa deadline,
 * ou celle de son projet ; en retard, tout aujourd'hui. Sans deadline : elle ne compte pas.
 */
export function spreadTasks(tasks: LoadTask[], projects: LoadProject[], today: string): LoadSpreads {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const spreads: TaskSpread[] = [];
  const undated = new Map<string, UndatedShare>();
  const remaining = new Map<string, { minutes: number; unestimated: number }>();

  for (const task of tasks) {
    if (task.status === 'done' || task.subjectId !== null || task.subtasksTotal > 0) continue;
    const project = task.projectId === null ? null : byId.get(task.projectId);
    if (project === undefined) continue; // projet en pause, en proposition…
    const estimated = task.estimateMin !== null;
    const minutes = task.estimateMin ?? DEFAULT_TASK_MIN;

    if (project) {
      const left = remaining.get(project.id) ?? { minutes: 0, unestimated: 0 };
      remaining.set(project.id, { minutes: left.minutes + minutes, unestimated: left.unestimated + (estimated ? 0 : 1) });
    }

    if (task.blockDate !== null && task.blockDate >= today) {
      spreads.push({ task, minutes, from: task.blockDate, to: task.blockDate, late: false, placed: true, estimated });
      continue;
    }
    const due = task.dueDate ?? project?.deadline ?? null;
    if (due === null) {
      const key = task.projectId ?? '';
      const share = undated.get(key) ?? { projectId: task.projectId, name: task.projectName, count: 0, minutes: 0 };
      undated.set(key, { ...share, count: share.count + 1, minutes: share.minutes + minutes });
      continue;
    }
    const late = due < today;
    const to = late ? today : due;
    const start = [today, task.scheduledDate ?? project?.startDate ?? today].sort()[1]!;
    spreads.push({ task, minutes, from: start > to ? to : start, to, late, placed: false, estimated });
  }
  const shares = [...undated.values()].sort((a, b) => Number(a.projectId === null) - Number(b.projectId === null));
  return { spreads, undated: shares, remaining };
}

/** Les minutes d'une tâche qui tombent dans [first, last] (jours inclus), au prorata des jours. */
function minutesWithin(spread: TaskSpread, first: string, last: string): number {
  const from = spread.from > first ? spread.from : first;
  const to = spread.to < last ? spread.to : last;
  if (from > to) return 0;
  return (spread.minutes * (daysBetween(from, to) + 1)) / (daysBetween(spread.from, spread.to) + 1);
}

export type ProjectShare = { projectId: string | null; name: string | null; minutes: number };

export type WeekWorkload = {
  week: string;
  /** Semaine finie : rien n'y est compté. */
  past: boolean;
  /** Minutes de travail à faire cette semaine (à partir d'aujourd'hui pour la semaine en cours). */
  todoMin: number;
  /** Dont ce qui est en retard. */
  lateMin: number;
  /** Tâches sans estimation comptées cette semaine. */
  unestimated: number;
  /** La part de chaque projet, la plus grosse d'abord (`projectId` nul : sans projet). */
  byProject: ProjectShare[];
  /** Minutes des blocs Travail (et « Les deux ») posés dans la Journée, à partir d'aujourd'hui. */
  plannedMin: number;
};

/** Un bloc compte comme du temps de travail posé : pas un bloc de cours, prévu, aujourd'hui ou plus tard. */
export function isWorkTime(block: LoadBlock, today: string): boolean {
  return block.mode !== 'school' && block.status === 'planned' && block.date >= today;
}

/** La charge de chaque semaine de la période, face au temps posé dans la Journée. */
export function weeklyWorkload(spreads: TaskSpread[], blocks: LoadBlock[], period: PlanningPeriod, today: string): WeekWorkload[] {
  return period.weeks.map((week) => {
    const last = addDaysISO(week, 6);
    if (last < today) return { week, past: true, todoMin: 0, lateMin: 0, unestimated: 0, byProject: [], plannedMin: 0 };
    const shares = new Map<string, ProjectShare>();
    let todoMin = 0;
    let lateMin = 0;
    let unestimated = 0;
    for (const spread of spreads) {
      const minutes = minutesWithin(spread, week, last);
      if (minutes === 0) continue;
      todoMin += minutes;
      if (spread.late) lateMin += minutes;
      if (!spread.estimated) unestimated += 1;
      const key = spread.task.projectId ?? '';
      const share = shares.get(key) ?? { projectId: spread.task.projectId, name: spread.task.projectName, minutes: 0 };
      shares.set(key, { ...share, minutes: share.minutes + minutes });
    }
    const plannedMin = blocks
      .filter((b) => b.date >= week && b.date <= last && isWorkTime(b, today))
      .reduce((sum, b) => sum + blockDuration(b), 0);
    const byProject = [...shares.values()].sort((a, b) => b.minutes - a.minutes);
    return { week, past: false, todoMin, lateMin, unestimated, byProject, plannedMin };
  });
}

/** Les minutes d'un projet semaine par semaine (pour sa ligne). */
export function projectWeekMinutes(load: WeekWorkload[], projectId: string): { week: string; minutes: number }[] {
  return load.map((w) => ({ week: w.week, minutes: w.byProject.find((s) => s.projectId === projectId)?.minutes ?? 0 }));
}

/** Arrondi pour l'affichage : au quart d'heure, et jamais 0 quand il y a quelque chose. */
export function displayMinutes(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.max(15, Math.round(minutes / 15) * 15);
}

/** Ce qui manque : le travail à faire moins le temps posé, s'il dépasse un quart d'heure (sinon 0). */
export function weekShortage(week: Pick<WeekWorkload, 'todoMin' | 'plannedMin'>): number {
  const short = week.todoMin - week.plannedMin;
  return short > 15 ? displayMinutes(short) : 0;
}

/**
 * La semaine est signalée (ambre) quand il manque du temps, et qu'on peut s'y attendre : cette semaine,
 * la suivante, ou une semaine plus lointaine où des blocs sont déjà posés. Plus loin, on n'a souvent
 * rien posé encore : la charge s'affiche, sans alerte.
 */
export function isWeekShort(week: WeekWorkload, today: string): boolean {
  if (week.past || weekShortage(week) === 0) return false;
  return week.week <= addDaysISO(today, 7) || week.plannedMin > 0;
}
