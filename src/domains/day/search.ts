import { isISODate } from '@/core/dates';

export type DayView = 'day' | 'week';

/** Page Journée : le jour affiché (aujourd'hui par défaut) et la vue (jour par défaut), dans l'URL interne. */
export type DaySearch = { day?: string; view?: 'week' };

export function validateDaySearch(search: Record<string, unknown>): DaySearch {
  const day = typeof search.day === 'string' && isISODate(search.day) ? search.day : undefined;
  return { day, view: search.view === 'week' ? 'week' : undefined };
}
