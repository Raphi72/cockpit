import type { TaskItem } from '@/domains/tasks/model';
import type { DayBlock, Module } from '../model';

/** Ce qu'on prend dans la page Journée. */
export type DayDragData =
  | { type: 'module'; module: Module }
  | { type: 'block'; block: DayBlock }
  | { type: 'task'; task: TaskItem };

/**
 * Où on le dépose : une colonne (un jour, à une heure), un bloc (pour une tâche), la liste « À caser »,
 * ou la corbeille (qui n'apparaît que pendant qu'on tient un bloc ou un module).
 */
export type DayDropData =
  | { kind: 'column'; day: string; firstHour: number; hourHeight: number }
  | { kind: 'block'; block: DayBlock }
  | { kind: 'to-place' }
  | { kind: 'trash' };

/**
 * Un module ou un bloc se pose dans une colonne, ou part à la corbeille ; un bloc peut aussi revenir dans
 * « À caser » (il redevient un module pour une fois). Une tâche va dans un bloc ou dans « À caser »
 * (jamais à la corbeille : la sortir d'un bloc ne la supprime pas).
 */
export function accepts(drag: DayDragData['type'], drop: DayDropData['kind']): boolean {
  if (drag === 'task') return drop === 'block' || drop === 'to-place';
  if (drag === 'block' && drop === 'to-place') return true;
  return drop === 'column' || drop === 'trash';
}
