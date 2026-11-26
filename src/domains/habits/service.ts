import { addDaysISO } from '@/core/dates';
import type { Db } from '@/core/db';
import { listPeriods } from '@/domains/school/periods/repository';
import { classesBetween } from '@/domains/school/timetable/model';
import { listSlots } from '@/domains/school/timetable/repository';
import { startOfDayTimestamp } from '@/domains/tasks/model';
import { doneDays, weekProgress, type WeekReview } from './model';
import { doneBlockMinutes, doneTaskCounts, listDoneBlocks, listHabitLogs, listHabits, receivedCents } from './repository';

/**
 * La revue d'une semaine (du lundi au dimanche) : heures de travail, de cours (l'emploi du temps et
 * les blocs Cours faits) et de sport (blocs faits), habitudes tenues, devoirs rendus, tâches terminées,
 * chiffre d'affaires encaissé. Tout est relu ou recalculé, rien n'est stocké.
 */
export async function buildWeekReview(db: Db, monday: string): Promise<WeekReview> {
  const next = addDaysISO(monday, 7);
  const [blocks, tasks, revenue, habits, logs, doneBlocks, slots, periods] = await Promise.all([
    doneBlockMinutes(db, monday, next),
    doneTaskCounts(db, startOfDayTimestamp(monday), startOfDayTimestamp(next)),
    receivedCents(db, monday, next),
    listHabits(db),
    listHabitLogs(db, monday, next),
    listDoneBlocks(db, monday, next),
    listSlots(db),
    listPeriods(db),
  ]);
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const classMinutes = classesBetween(slots, periods, monday, next).reduce(
    (sum, c) => sum + minutes(c.slot.endsAt) - minutes(c.slot.startsAt),
    0,
  );
  return {
    monday,
    workMinutes: blocks.work,
    schoolMinutes: blocks.school + classMinutes,
    sportMinutes: blocks.sport,
    habits: habits.map((habit) => ({ name: habit.name, ...weekProgress(habit, doneDays(habit, logs, doneBlocks), monday) })),
    homeworkDone: tasks.homework,
    tasksDone: tasks.tasks,
    revenueCents: revenue,
  };
}
