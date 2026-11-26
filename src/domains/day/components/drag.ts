import type { TaskItem } from '@/domains/tasks/model';
import type { DayBlock, Module } from '../model';

/** Ce qu'on prend dans la page Journée. */
export type DayDragData =
  | { type: 'module'; module: Module }
  | { type: 'block'; block: DayBlock }
  | { type: 'task'; task: TaskItem };

/** Où on le dépose : une colonne (un jour, à une heure), un bloc (pour une tâche), ou la liste « À caser ». */
export type DayDropData =
  | { kind: 'column'; day: string; firstHour: number; hourHeight: number }
  | { kind: 'block'; block: DayBlock }
  | { kind: 'to-place' };

/** Un module ou un bloc se pose dans une colonne ; une tâche, dans un bloc ou dans « À caser ». */
export function accepts(drag: DayDragData['type'], drop: DayDropData['kind']): boolean {
  if (drag === 'task') return drop === 'block' || drop === 'to-place';
  return drop === 'column';
}
