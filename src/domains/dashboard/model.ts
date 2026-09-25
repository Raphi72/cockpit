import { daysBetween, relativeDateLabel, timeToMinutes } from '@/core/dates';
import { formatMoney } from '@/core/money';
import type { AgendaItem, AgendaKind } from '@/domains/agenda';
import type { PaymentListItem } from '@/domains/finance/payments/model';
import { deadlineTone, projectMoney, type ProjectListItem } from '@/domains/projects/model';

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
        reason: `Deadline dépassée de ${daysBetween(project.deadline, today)} j`,
        projectId: project.id,
        action: null,
      });
    } else if (project.deadline && tone === 'soon') {
      alerts.push({
        key: `soon:${project.id}`,
        tone: 'warning',
        kind: 'deadline',
        title: project.name,
        reason: `Deadline ${relativeDateLabel(project.deadline, today)}`,
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
      reason: `${showAmounts ? 'En retard' : 'Paiement en retard'} de ${daysBetween(payment.dueDate, today)} j`,
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
