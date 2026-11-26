import { isISODate } from '@/core/dates';

export type HabitsTab = 'habits' | 'workouts' | 'review';

/** Page Habitudes : l'onglet (habitudes et objectifs par défaut) et, pour la revue, la semaine (son lundi). */
export type HabitsSearch = { tab?: 'workouts' | 'review'; week?: string };

export function validateHabitsSearch(search: Record<string, unknown>): HabitsSearch {
  const tab = search.tab === 'workouts' || search.tab === 'review' ? search.tab : undefined;
  const week = typeof search.week === 'string' && isISODate(search.week) ? search.week : undefined;
  return { tab, week };
}
