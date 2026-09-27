import { create } from 'zustand';
import { DEADLINE_HORIZON } from './deadline';

/**
 * Copie du réglage `deadlines.days` (nombre de jours avant sa deadline où un élément compte comme
 * proche), faite au démarrage puis à chaque changement (`app/preferences.ts`) : toutes les couleurs
 * d'urgence la lisent sans requête (lignes, fiches, calendrier, planning, dashboard). Les règles pures
 * (`deadlineStatus`…) la reçoivent en paramètre. La table `settings` reste la source.
 */
const useHorizonStore = create<{ horizon: number }>()(() => ({ horizon: DEADLINE_HORIZON }));

export function useDeadlineHorizon(): number {
  return useHorizonStore((state) => state.horizon);
}

export function setDeadlineHorizon(horizon: number): void {
  useHorizonStore.setState({ horizon });
}
