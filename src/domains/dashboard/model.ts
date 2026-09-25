import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addDaysISO, daysBetween, formatLongDate, relativeDateLabel, timeToMinutes } from '@/core/dates';
import { relativeDayText } from '@/core/deadline';
import { formatMoney } from '@/core/money';
import { UPCOMING_AGENDA_DAYS, upcomingDays, type AgendaItem, type AgendaKind } from '@/domains/agenda';
import type { PaymentListItem } from '@/domains/finance/payments/model';
import { deadlineTone, projectMoney, type ProjectListItem } from '@/domains/projects/model';
import { selectPlannedOn, type TaskItem } from '@/domains/tasks/model';

export type AlertTone = 'danger' | 'warning' | 'muted';

/** Action directe proposée au survol, en plus de l'ouverture du projet. */
export type AlertAction =
  | { kind: 'receive'; payment: PaymentListItem }
  | { kind: 'add-task'; projectId: string };

export type Alert = {
  key: string;
  tone: AlertTone;
  kind: 'deadline' | 'payment' | 'start' | 'budget' | 'noaction';
  title: string;
  reason: string;
  projectId: string | null;
  action: AlertAction | null;
};

const TONE_RANK: Record<AlertTone, number> = { danger: 0, warning: 1, muted: 2 };

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/**
 * Règles du bloc « À surveiller » (P11), des plus graves aux plus légères :
 * deadline dépassée, encaissement en retard, deadline à 3 jours ou moins,
 * projet qui démarre dans la semaine sans tâche, projet en cours sans tâche ouverte
 * (pas de prochaine action), budget sans échéance.
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
    const tone = deadlineTone(project, today);
    if (project.deadline && tone === 'late') {
      alerts.push({
        key: `late:${project.id}`,
        tone: 'danger',
        kind: 'deadline',
        title: project.name,
        reason: `Deadline dépassée de ${plural(daysBetween(project.deadline, today), 'jour')}`,
        projectId: project.id,
        action: null,
      });
    } else if (project.deadline && tone === 'soon') {
      alerts.push({
        key: `soon:${project.id}`,
        tone: 'warning',
        kind: 'deadline',
        title: project.name,
        reason: `Deadline ${relativeDayText(project.deadline, today).toLowerCase()}`,
        projectId: project.id,
        action: null,
      });
    }

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

  // Un projet déjà signalé en rouge ou en ambre n'a pas besoin d'un rappel secondaire en plus.
  const flagged = new Set(alerts.filter((a) => a.tone !== 'muted' && a.projectId).map((a) => a.projectId));
  return alerts
    .filter((a) => a.tone !== 'muted' || !flagged.has(a.projectId))
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
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
 * prévues chaque jour. Celles du jour affiché dans le bloc de tâches (`shownDay`, aujourd'hui par défaut)
 * n'y sont pas répétées. Seuls les jours qui ont quelque chose sont gardés.
 */
export function upcomingWithTasks(
  items: AgendaItem[],
  open: TaskItem[],
  today: string,
  shownDay = today,
  count = UPCOMING_AGENDA_DAYS,
): UpcomingDay[] {
  const agenda = new Map(upcomingDays(items, today, count).map((group) => [group.day, group.items]));
  return Array.from({ length: count }, (_, index) => addDaysISO(today, index))
    .map((day) => ({
      day,
      items: agenda.get(day) ?? [],
      tasks: day === today || day === shownDay ? [] : selectPlannedOn(open, day, today),
    }))
    .filter((group) => group.items.length > 0 || group.tasks.length > 0);
}
