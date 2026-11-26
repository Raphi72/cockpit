import { addDaysISO } from '@/core/dates';
import type { AgendaItem } from '@/domains/agenda/model';
import { isHomework, type TaskItem } from '@/domains/tasks/model';

/**
 * Aujourd'hui en mode Cours (P13) : à gauche les cours du jour et les devoirs à rendre, à droite le
 * prochain examen et les prochains jours. Ces règles trient ce qui est déjà chargé.
 */

/** Horizon des devoirs « à rendre » : la semaine qui vient. */
export const HOMEWORK_DAYS = 7;

/**
 * Devoirs du jour affiché : ceux en retard (aujourd'hui seulement), ceux à rendre dans les 7 jours, et
 * ceux qu'on a prévu de faire ce jour-là. Les retards d'abord, puis par jour de rendu ; les devoirs
 * sans date de rendu à la fin. Pas les sous-tâches : elles sont dans leur devoir.
 */
export function homeworkForDay(open: TaskItem[], day: string, today: string, days = HOMEWORK_DAYS): TaskItem[] {
  const last = addDaysISO(day, days);
  const isToday = day === today;
  return open
    .filter((t) => isHomework(t) && t.status !== 'done' && t.parentId === null)
    .filter((t) => {
      const due = t.dueDate;
      if (due !== null && due < day) return isToday;
      if (due !== null && due < last) return true;
      return t.scheduledDate !== null && (isToday ? t.scheduledDate <= day : t.scheduledDate === day);
    })
    .sort(
      (a, b) =>
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.priority - a.priority || a.sortOrder - b.sortOrder,
    );
}

/** « Prochains jours » en mode Cours : les examens et les événements personnels (pas ceux d'un projet). */
export function schoolUpcomingItems(items: AgendaItem[]): AgendaItem[] {
  return items.filter((item) => item.source === 'exam' || item.source === 'google' || (item.source === 'event' && item.projectId === null));
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/**
 * La journée en une ligne : « 3 cours · 2 devoirs à rendre demain · 1 en retard », ou, en vacances,
 * « Vacances de Noël : pas de cours ».
 */
export function schoolDaySummary(input: {
  day: string;
  today: string;
  classes: number;
  holidayName: string | null;
  homework: TaskItem[];
}): string {
  const { day, today } = input;
  const next = addDaysISO(day, 1);
  const dueNext = input.homework.filter((t) => t.dueDate === next).length;
  const late = day === today ? input.homework.filter((t) => t.dueDate !== null && t.dueDate < today).length : 0;
  const classes = input.holidayName
    ? `${input.holidayName} : pas de cours`
    : input.classes === 0
      ? 'Pas de cours'
      : plural(input.classes, 'cours', 'cours');
  return [
    classes,
    dueNext > 0 ? `${plural(dueNext, 'devoir', 'devoirs')} à rendre ${day === today ? 'demain' : 'le lendemain'}` : null,
    late > 0 ? `${late} en retard` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
