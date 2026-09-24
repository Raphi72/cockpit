import { isISODate } from '@/core/dates';

/**
 * Jour affiché par le calendrier, gardé dans l'URL interne (absent : aujourd'hui).
 * La vue (mois, semaine, jour) et les filtres sont des préférences, retrouvées à la visite suivante.
 */
export type CalendarSearch = { date?: string };

export function validateCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  return { date: typeof search.date === 'string' && isISODate(search.date) ? search.date : undefined };
}
