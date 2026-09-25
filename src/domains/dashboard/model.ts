import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addDaysISO, daysBetween, formatLongDate, relativeDateLabel, timeToMinutes } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { UPCOMING_AGENDA_DAYS, upcomingDays, type AgendaItem, type AgendaKind } from '@/domains/agenda';
import type { PaymentListItem } from '@/domains/finance/payments/model';
import { CLOSED_STATUSES, deadlineTone, projectMoney, type ProjectListItem } from '@/domains/projects/model';
import { selectStartingOn, type TaskItem } from '@/domains/tasks/model';
import type { DayMark } from '@/ui/primitives/DatePicker';

export type AlertTone = 'danger' | 'warning' | 'muted';

/** Action directe proposée au survol, en plus de l'ouverture du projet. */
export type AlertAction =
  | { kind: 'receive'; payment: PaymentListItem }
  | { kind: 'add-task'; projectId: string };

export type Alert = {
  key: string;
  tone: AlertTone;
  kind: 'payment' | 'start' | 'budget' | 'noaction';
  title: string;
  reason: string;
  projectId: string | null;
  action: AlertAction | null;
};

const TONE_RANK: Record<AlertTone, number> = { danger: 0, warning: 1, muted: 2 };

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/**
 * Règles du bloc « À surveiller » (P11), des plus graves aux plus légères : encaissement en retard,
 * projet qui démarre dans la semaine sans tâche, projet en cours sans tâche ouverte (pas de prochaine
 * action), budget sans échéance.
 *
 * Les deadlines (dépassées ou proches) ont leur propre bloc, « Deadlines » (voir selectDeadlines). Un
 * projet dont la deadline est dépassée ou à 3 jours ou moins y est déjà en couleur : ses rappels
 * secondaires (budget, prochaine action) ne sont pas répétés ici.
 */
export function buildAlerts(input: {
  projects: ProjectListItem[];
  overduePayments: PaymentListItem[];
  today: string;
  /** Faux : aucun montant dans les textes (réglage « Afficher les montants sur le tableau de bord »). */
  showAmounts?: boolean;
}): Alert[] {
  const { projects, overduePayments, today, showAmounts = true } = input;
  const alerts: Alert[] = [];

  for (const project of projects) {
    if (project.status === 'planned' && project.startDate && project.tasksTotal === 0) {
      const inDays = daysBetween(today, project.startDate);
      if (inDays >= 0 && inDays <= 7) {
        alerts.push({
          key: `start:${project.id}`,
          tone: 'muted',
          kind: 'start',
          title: project.name,
          reason: `Commence ${relativeDateLabel(project.startDate, today)} · aucune tâche créée`,
          projectId: project.id,
          action: { kind: 'add-task', projectId: project.id },
        });
      }
    }

    if (project.status === 'active' && project.tasksTotal - project.tasksDone === 0) {
      alerts.push({
        key: `noaction:${project.id}`,
        tone: 'muted',
        kind: 'noaction',
        title: project.name,
        reason: project.tasksTotal === 0 ? 'Aucune tâche : quelle est la prochaine étape ?' : 'Toutes les tâches sont faites : terminer le projet ?',
        projectId: project.id,
        action: project.tasksTotal === 0 ? { kind: 'add-task', projectId: project.id } : null,
      });
    }

    const money = projectMoney(project);
    if (money.budget > 0 && money.unplanned > 0) {
      alerts.push({
        key: `budget:${project.id}`,
        tone: 'muted',
        kind: 'budget',
        title: project.name,
        reason: showAmounts ? `${formatMoney(money.unplanned)} du budget sans échéance` : 'Une partie du budget sans échéance',
        projectId: project.id,
        action: null,
      });
    }
  }

  for (const payment of overduePayments) {
    if (!payment.dueDate) continue;
    alerts.push({
      key: `payment:${payment.id}`,
      tone: 'danger',
      kind: 'payment',
      title: showAmounts
        ? `${payment.clientName ?? payment.projectName ?? payment.label} · ${formatMoney(payment.amountCents)}`
        : (payment.clientName ?? payment.projectName ?? payment.label),
      reason: `${showAmounts ? 'En retard' : 'Paiement en retard'} de ${plural(daysBetween(payment.dueDate, today), 'jour')}`,
      projectId: payment.projectId,
      action: { kind: 'receive', payment },
    });
  }

  // Un projet déjà signalé en rouge ou en ambre (ici ou dans « Deadlines ») n'a pas besoin d'un rappel secondaire en plus.
  const flagged = new Set<string | null>([
    ...alerts.filter((a) => a.tone !== 'muted' && a.projectId).map((a) => a.projectId),
    ...projects.filter((p) => ['late', 'soon'].includes(deadlineTone(p, today) ?? '')).map((p) => p.id),
  ]);
  return alerts
    .filter((a) => a.tone !== 'muted' || !flagged.has(a.projectId))
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

// ─── Deadlines ──────────────────────────────────────────────────────────────

/** Une deadline entre dans le bloc « Deadlines » 7 jours avant. */
export const DEADLINE_DAYS = 7;

export type DeadlineEntry = {
  key: string;
  source: 'project' | 'task' | 'event';
  /** Identifiant dans la table d'origine : c'est elle qu'on ouvre au clic. */
  id: string;
  title: string;
  /** Projet d'une tâche ; pour les autres, la nature de la date. */
  detail: string | null;
  date: string;
  /** Tâche sans début, dont la deadline n'est pas aujourd'hui : il reste à lui trouver un moment. */
  toPlan: boolean;
};

const SOURCE_RANK: Record<DeadlineEntry['source'], number> = { project: 0, event: 1, task: 2 };

/**
 * Bloc « Deadlines » du dashboard : tout ce qui doit être fini d'ici 7 jours (aujourd'hui compris),
 * pour qu'aucune deadline n'arrive par surprise. Les deadlines de projets, de tâches (qu'elles aient
 * un début ou non) et les échéances saisies dans le calendrier. Un projet en retard y reste en tête.
 * Les tâches en retard n'y sont pas : elles sont en tête d'« Aujourd'hui ».
 * La plus proche d'abord ; le même jour, les projets, puis les échéances, puis les tâches prioritaires.
 */
export function selectDeadlines(input: {
  /** Projets ouverts et validés (pas de Proposition). */
  projects: ProjectListItem[];
  /** Tâches à faire. */
  tasks: TaskItem[];
  /** Agenda des jours à venir : on y prend les événements « Échéance ». */
  agenda: AgendaItem[];
  today: string;
  days?: number;
}): DeadlineEntry[] {
  const { projects, tasks, agenda, today, days = DEADLINE_DAYS } = input;
  const limit = addDaysISO(today, days);
  const entries: (DeadlineEntry & { priority: number })[] = [];

  for (const project of projects) {
    if (!project.deadline || project.deadline > limit || CLOSED_STATUSES.includes(project.status)) continue;
    entries.push({
      key: `project:${project.id}`,
      source: 'project',
      id: project.id,
      title: project.name,
      detail: 'deadline du projet',
      date: project.deadline,
      toPlan: false,
      priority: 0,
    });
  }
  for (const task of tasks) {
    if (task.status === 'done' || !task.dueDate || task.dueDate < today || task.dueDate > limit) continue;
    entries.push({
      key: `task:${task.id}`,
      source: 'task',
      id: task.id,
      title: task.title,
      detail: task.projectName,
      date: task.dueDate,
      toPlan: task.scheduledDate === null && task.dueDate > today,
      priority: task.priority,
    });
  }
  for (const item of agenda) {
    const date = item.start.slice(0, 10);
    if (item.source !== 'event' || item.kind !== 'deadline' || date < today || date > limit) continue;
    entries.push({
      key: `event:${item.id}`,
      source: 'event',
      id: item.id,
      title: item.title,
      detail: 'échéance',
      date,
      toPlan: false,
      priority: 0,
    });
  }

  return entries
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
        b.priority - a.priority ||
        a.title.localeCompare(b.title, 'fr'),
    )
    .map(({ priority: _priority, ...entry }) => entry);
}

/** Jours à marquer dans le sélecteur de date du dashboard : une deadline, sinon des tâches prévues. */
export function dayMarks(input: { projects: ProjectListItem[]; tasks: TaskItem[] }): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();
  for (const task of input.tasks) {
    const day = task.scheduledDate ?? task.dueDate;
    if (task.status !== 'done' && day && !marks.has(day)) marks.set(day, 'task');
  }
  for (const task of input.tasks) if (task.status !== 'done' && task.dueDate) marks.set(task.dueDate, 'deadline');
  for (const project of input.projects) if (project.deadline) marks.set(project.deadline, 'deadline');
  return marks;
}

const EVENT_WORDS: Partial<Record<AgendaKind, string>> = {
  appointment: 'rendez-vous',
  meeting: 'réunion',
  deadline: 'échéance',
};

/** Prochain événement à heure fixe de la journée, pas encore commencé (`minutes` : l'heure actuelle). */
export function nextTimedEvent(items: AgendaItem[], today: string, minutes: number): AgendaItem | null {
  const upcoming = items
    .filter((item) => item.source === 'event' && !item.allDay && item.start.slice(0, 10) === today)
    .filter((item) => timeToMinutes(item.start.slice(11, 16)) >= minutes)
    .sort((a, b) => a.start.localeCompare(b.start));
  return upcoming[0] ?? null;
}

/**
 * Phrase de synthèse sous la date : ce qu'il y a à faire aujourd'hui et le prochain rendez-vous.
 * « 5 tâches aujourd'hui, dont 1 en retard · rendez-vous à 14:00 »
 */
export function dashboardSummary(input: { todayCount: number; overdueCount: number; nextEvent: AgendaItem | null }): string {
  const { todayCount, overdueCount, nextEvent } = input;
  const parts: string[] = [];
  if (todayCount > 0) {
    const tasks = `${todayCount} tâche${todayCount > 1 ? 's' : ''} aujourd’hui`;
    parts.push(overdueCount > 0 ? `${tasks}, dont ${overdueCount} en retard` : tasks);
  }
  if (nextEvent) parts.push(`${EVENT_WORDS[nextEvent.kind] ?? 'événement'} à ${nextEvent.start.slice(11, 16)}`);
  return parts.length > 0 ? parts.join(' · ') : 'Rien de prévu aujourd’hui.';
}

// ─── Navigation de jour en jour ─────────────────────────────────────────────

/** Titre de la page : « Samedi 26 septembre », avec l'année si elle diffère. */
export function dashboardTitle(day: string, today: string): string {
  const title = formatLongDate(parseISO(day));
  return day.slice(0, 4) === today.slice(0, 4) ? title : `${title} ${day.slice(0, 4)}`;
}

/** Intitulé du bloc de tâches : « Aujourd'hui », « Demain », « Hier », sinon « Lundi 28 sept. ». */
export function dayTasksHeading(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  const text = format(parseISO(day), day.slice(0, 4) === today.slice(0, 4) ? 'EEEE d MMM' : 'EEEE d MMM yyyy', {
    locale: fr,
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Synthèse sous la date quand on regarde un autre jour qu'aujourd'hui :
 * « Demain · 3 tâches prévues », « Hier · 2 tâches terminées, 1 pas faite ».
 */
export function otherDaySummary(input: { day: string; today: string; planned: number; done: number }): string {
  const { day, today, planned, done } = input;
  const diff = daysBetween(today, day);
  const when = diff === 1 ? 'Demain' : diff === -1 ? 'Hier' : diff > 0 ? `Dans ${diff} jours` : `Il y a ${-diff} jours`;
  if (diff > 0) return `${when} · ${planned > 0 ? `${plural(planned, 'tâche')} prévue${planned > 1 ? 's' : ''}` : 'rien de prévu'}`;
  const parts: string[] = [];
  if (done > 0) parts.push(`${plural(done, 'tâche')} terminée${done > 1 ? 's' : ''}`);
  if (planned > 0) parts.push(`${planned} pas faite${planned > 1 ? 's' : ''}`);
  return `${when} · ${parts.length > 0 ? parts.join(', ') : 'aucune tâche'}`;
}

// ─── Prochains jours ────────────────────────────────────────────────────────

/** Tâches montrées par jour dans « Prochains jours » : au-delà, « +N » ouvre ce jour dans le bloc de tâches. */
export const UPCOMING_TASKS_PER_DAY = 3;

export type UpcomingDay = { day: string; items: AgendaItem[]; tasks: TaskItem[] };

/**
 * « Prochains jours » : l'agenda des 7 jours (aujourd'hui compris) et, à partir de demain, les tâches
 * qui commencent chaque jour. Les deadlines n'y sont pas (projets, échéances, tâches qui n'ont qu'une
 * deadline) : elles sont toutes dans le bloc « Deadlines ». Celles du jour affiché dans le bloc de
 * tâches (`shownDay`, aujourd'hui par défaut) n'y sont pas répétées. Seuls les jours qui ont quelque
 * chose sont gardés.
 */
export function upcomingWithTasks(
  items: AgendaItem[],
  open: TaskItem[],
  today: string,
  shownDay = today,
  count = UPCOMING_AGENDA_DAYS,
): UpcomingDay[] {
  const withoutDeadlines = items.filter((item) => item.kind !== 'project_deadline' && item.kind !== 'deadline');
  const agenda = new Map(upcomingDays(withoutDeadlines, today, count).map((group) => [group.day, group.items]));
  return Array.from({ length: count }, (_, index) => addDaysISO(today, index))
    .map((day) => ({
      day,
      items: agenda.get(day) ?? [],
      tasks: day === today || day === shownDay ? [] : selectStartingOn(open, day, today),
    }))
    .filter((group) => group.items.length > 0 || group.tasks.length > 0);
}
