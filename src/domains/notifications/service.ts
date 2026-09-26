import { addDaysISO, timeToMinutes } from '@/core/dates';
import type { Db } from '@/core/db';
import { listAgenda } from '@/domains/agenda/repository';
import { nextTimedEvent } from '@/domains/dashboard/model';
import { SETTINGS } from '@/domains/settings/model';
import { getSetting } from '@/domains/settings/repository';
import { selectToday } from '@/domains/tasks/model';
import { listOpenTasks } from '@/domains/tasks/repository';
import {
  EVENT_LEAD_MIN,
  MORNING_SUMMARY_UNTIL,
  RULES_SETTING,
  addMinutesToStamp,
  bundleNotices,
  deadlineNotices,
  eventNotices,
  paymentNotices,
  priorityTaskNotices,
  projectStartNotices,
  resolveRules,
  stampOf,
  summaryNotice,
  type DaySummary,
  type Moment,
  type Notice,
  type Round,
} from './model';
import {
  claimNotification,
  listDeadlinesSoon,
  listPaymentsToNotify,
  listPriorityTasksDue,
  listProjectsStarting,
  listTimedEventsBetween,
  pruneNotificationLogStatement,
} from './repository';

export type SendNotification = (notification: { title: string; body: string }) => Promise<void>;

/** Le journal garde six mois de notifications envoyées. */
const LOG_KEEP_MS = 183 * 24 * 60 * 60 * 1000;

/** Ce que le dashboard affiche sous la date : les tâches du jour et le prochain rendez-vous. */
async function loadDaySummary(db: Db, moment: Moment): Promise<DaySummary> {
  const { today } = moment;
  const [open, agenda] = await Promise.all([listOpenTasks(db), listAgenda(db, today, addDaysISO(today, 1))]);
  const { overdue, today: rest } = selectToday(open, today);
  return {
    todayCount: overdue.length + rest.length,
    overdueCount: overdue.length,
    nextEvent: nextTimedEvent(agenda, today, timeToMinutes(moment.time)),
  };
}

/**
 * Notifications dues à ce moment, selon les règles activées : les rendez-vous à chaque vérification,
 * le reste seulement pendant une tournée (voir `Round`). Les plus urgentes d'abord.
 */
export async function collectNotices(db: Db, moment: Moment, round: Round): Promise<Notice[]> {
  const rules = resolveRules(await getSetting(db, RULES_SETTING.key));
  const { today } = moment;
  const notices: Notice[] = [];

  if (rules.events) {
    const from = stampOf(moment);
    const events = await listTimedEventsBetween(db, from, addMinutesToStamp(from, EVENT_LEAD_MIN));
    notices.push(...eventNotices(events, moment));
  }
  if (round === null) return notices;

  const tomorrow = addDaysISO(today, 1);
  if (round === 'morning' && rules.morningSummary && moment.time < MORNING_SUMMARY_UNTIL) {
    const summary = summaryNotice(await loadDaySummary(db, moment), today);
    if (summary) notices.push(summary);
  }
  if (rules.deadlines) notices.push(...deadlineNotices(await listDeadlinesSoon(db, today), today));
  if (rules.priorityTasks) notices.push(...priorityTaskNotices(await listPriorityTasksDue(db, tomorrow), today));
  if (rules.payments) {
    const showAmounts =
      (await getSetting<boolean>(db, SETTINGS.dashboardShowAmounts.key)) ?? SETTINGS.dashboardShowAmounts.fallback;
    notices.push(...paymentNotices(await listPaymentsToNotify(db, today, tomorrow), today, showAmounts));
  }
  if (rules.projectStarts) notices.push(...projectStartNotices(await listProjectsStarting(db, today), today));
  return notices;
}

/**
 * Une vérification : ce qui est dû et n'est jamais parti est noté au journal, puis envoyé
 * (regroupé au-delà de 3). Renvoie le nombre de notifications nouvelles.
 */
export async function runNotifications(
  db: Db,
  input: { moment: Moment; round: Round; now: string },
  send: SendNotification,
): Promise<number> {
  if (input.round === 'launch') {
    await db.batch([pruneNotificationLogStatement(new Date(Date.parse(input.now) - LOG_KEEP_MS).toISOString())]);
  }
  const notices = await collectNotices(db, input.moment, input.round);
  const fresh: Notice[] = [];
  for (const notice of notices) {
    if (await claimNotification(db, notice.key, input.now)) fresh.push(notice);
  }
  for (const notification of bundleNotices(fresh)) await send(notification);
  return fresh.length;
}
