import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { AgendaItem } from '../model';

/** Glisser-déposer du calendrier (voir CalendarDnd) : les éléments qu'on prend et les cases où on les dépose. */

/** Ce que porte une zone de dépôt : son jour et, pour une colonne de la grille horaire, de quoi lire l'heure. */
export type DropData = { day: string; grid?: { firstHour: number; hourHeight: number } };

/** Un jour du mois, ou la ligne « journée » d'un jour : on y change de jour. */
export function useDayDrop(day: string) {
  return useDroppable({ id: `day:${day}`, data: { day } satisfies DropData });
}

/** Une colonne de la grille horaire : on y change de jour, et d'heure pour un événement à heure fixe. */
export function useSlotDrop(day: string, firstHour: number, hourHeight: number) {
  return useDroppable({ id: `slot:${day}`, data: { day, grid: { firstHour, hourHeight } } satisfies DropData });
}

/**
 * Un élément du calendrier qu'on peut prendre et déposer ailleurs. `id` doit être unique à l'écran :
 * un même élément peut apparaître dans plusieurs cases (barre coupée par la semaine…).
 */
export function useAgendaDrag(item: AgendaItem, id: string) {
  return useDraggable({ id, data: { item } });
}
