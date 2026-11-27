import { isISODate } from '@/core/dates';

/**
 * Jour affiché par le calendrier, gardé dans l'URL interne (absent : aujourd'hui), et le mode « Emploi du
 * temps » (la semaine avec seulement les cours). La vue (mois, semaine, jour) et les filtres sont des
 * préférences, retrouvées à la visite suivante.
 */
export type CalendarSearch = { date?: string; timetable?: true };

export function validateCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  return {
    date: typeof search.date === 'string' && isISODate(search.date) ? search.date : undefined,
    timetable: search.timetable === true || search.timetable === 'true' || search.timetable === 1 ? true : undefined,
  };
}
