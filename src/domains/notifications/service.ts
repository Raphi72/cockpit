import { addDaysISO, timeToMinutes } from '@/core/dates';
import type { Db } from '@/core/db';
import { listAgenda } from '@/domains/agenda/repository';
import { listBlocks } from '@/domains/day/repository';
import { doneDays, isScheduled, weekProgress } from '@/domains/habits/model';
import { listDoneBlocks, listHabitLogs, listHabits } from '@/domains/habits/repository';
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
  blockNotices,
  eventNotices,
  habitNotices,
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

/** Les habitudes avec un rappel, et si elles sont encore attendues aujourd'hui (prévues, pas faites, semaine pas tenue). */
async function loadHabitsForNotice(db: Db, today: string) {
  const habits = (await listHabits(db)).filter((h) => h.reminderTime);
  if (habits.length === 0) return [];
  const from = addDaysISO(today, -6);
  const to = addDaysISO(today, 1);
  const [logs, doneBlocks] = await Promise.all([listHabitLogs(db, from, to), listDoneBlocks(db, from, to)]);
  return habits.map((habit) => {
    const done = doneDays(habit, logs, doneBlocks);
    const week = weekProgress(habit, done, today);
    const due = !done.has(today) && isScheduled(habit, today) && (habit.frequency !== 'weekly' || week.done < week.target);
    return { id: habit.id, name: habit.name, reminderTime: habit.reminderTime, due };
  });
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
  if (rules.blocks) {
    notices.push(...blockNotices(await listBlocks(db, today, addDaysISO(today, 1)), moment));
  }
  if (rules.habits) {
    notices.push(...habitNotices(await loadHabitsForNotice(db, today), moment));
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
  // À chaque tournée (ouverture, ou matin quand Cockpit reste lancé plusieurs jours).
  if (input.round !== null) {
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
