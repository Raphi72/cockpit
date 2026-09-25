import { isISODate } from '@/core/dates';

/**
 * Jour dont le dashboard montre les tâches (flèches autour de la date), gardé dans l'URL interne :
 * on le retrouve en revenant d'une fiche. Absent : aujourd'hui.
 */
export type DashboardSearch = { day?: string };

export function validateDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  return { day: typeof search.day === 'string' && isISODate(search.day) ? search.day : undefined };
}
