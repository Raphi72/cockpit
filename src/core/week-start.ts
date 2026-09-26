import { create } from 'zustand';

/** Premier jour de la semaine, selon la convention de date-fns : 1 = lundi, 0 = dimanche. */
export type WeekStart = 0 | 1;

export function isWeekStart(value: unknown): value is WeekStart {
  return value === 0 || value === 1;
}

/**
 * Copie du réglage `calendar.weekStartsOn`, faite au démarrage puis à chaque changement
 * (`app/preferences.ts`) : les grilles de dates (calendrier, planning, sélecteur de date) la lisent
 * sans requête. La table `settings` reste la source.
 */
const useWeekStartStore = create<{ weekStartsOn: WeekStart }>()(() => ({ weekStartsOn: 1 }));

export function useWeekStartsOn(): WeekStart {
  return useWeekStartStore((state) => state.weekStartsOn);
}

export function setWeekStartsOn(weekStartsOn: WeekStart): void {
  useWeekStartStore.setState({ weekStartsOn });
}
