import { daysBetween, relativeDateLabel } from '@/core/dates';
import { formatMoney } from '@/core/money';
import type { OverduePayment } from '@/domains/finance/payments/model';
import { deadlineTone, projectMoney, type ProjectListItem } from '@/domains/projects/model';

export type AlertTone = 'danger' | 'warning' | 'muted';

export type Alert = {
  key: string;
  tone: AlertTone;
  kind: 'deadline' | 'payment' | 'start' | 'budget';
  title: string;
  reason: string;
  projectId: string | null;
};

const TONE_RANK: Record<AlertTone, number> = { danger: 0, warning: 1, muted: 2 };

/**
 * Règles du bloc « À surveiller » (P11), des plus graves aux plus légères :
 * deadline dépassée, encaissement en retard, deadline à 3 jours ou moins,
 * projet qui démarre dans la semaine sans tâche, budget sans échéance.
 */
export function buildAlerts(input: {
  projects: ProjectListItem[];
  overduePayments: OverduePayment[];
  today: string;
}): Alert[] {
  const { projects, overduePayments, today } = input;
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
      });
    } else if (project.deadline && tone === 'soon') {
      alerts.push({
        key: `soon:${project.id}`,
        tone: 'warning',
        kind: 'deadline',
        title: project.name,
        reason: `Deadline ${relativeDateLabel(project.deadline, today)}`,
        projectId: project.id,
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
        });
      }
    }

    const money = projectMoney(project);
    if (money.budget > 0 && money.unplanned > 0) {
      alerts.push({
        key: `budget:${project.id}`,
        tone: 'muted',
        kind: 'budget',
        title: project.name,
        reason: `${formatMoney(money.unplanned)} du budget sans échéance`,
        projectId: project.id,
      });
    }
  }

  for (const payment of overduePayments) {
    if (!payment.dueDate) continue;
    alerts.push({
      key: `payment:${payment.id}`,
      tone: 'danger',
      kind: 'payment',
      title: `${payment.clientName ?? payment.projectName ?? payment.label} · ${formatMoney(payment.amountCents)}`,
      reason: `En retard de ${daysBetween(payment.dueDate, today)} j`,
      projectId: payment.projectId,
    });
  }

  return alerts.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
}

/** Phrase de synthèse sous la date du dashboard. */
export function dashboardSummary(projects: ProjectListItem[], alerts: Alert[]): string {
  const active = projects.filter((p) => p.status === 'active').length;
  const late = alerts.filter((a) => a.kind === 'deadline' && a.tone === 'danger').length;
  const parts: string[] = [];
  if (active > 0) parts.push(`${active} projet${active > 1 ? 's' : ''} en cours`);
  if (late > 0) parts.push(`${late} en retard`);
  const latePayments = alerts.filter((a) => a.kind === 'payment').length;
  if (latePayments > 0) parts.push(`${latePayments} paiement${latePayments > 1 ? 's' : ''} en retard`);
  return parts.length > 0 ? parts.join(' · ') : 'Rien de prévu pour l’instant.';
}
