import { isISODate } from '@/core/dates';

/** Jour autour duquel le planning est centré, gardé dans l'URL interne (absent : aujourd'hui). */
export type PlanningSearch = { date?: string };

export function validatePlanningSearch(search: Record<string, unknown>): PlanningSearch {
  return { date: typeof search.date === 'string' && isISODate(search.date) ? search.date : undefined };
}
