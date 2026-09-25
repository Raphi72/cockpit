import { createContext, useContext } from 'react';
import { NEW_TASK_ID, placeInTree, type TaskItem, type TaskNode, type TreeDrop } from './model';

/**
 * Glisser-déposer de la fiche projet : les tâches (liste en arbre) et les idées partagent le même
 * glisser-déposer. Une tâche se range avant, après ou dans une autre (sous-tâche), ou part dans les
 * idées ; une idée devient une tâche là où on la dépose.
 */

/** Ce qu'on fait glisser (l'idée est réduite à ce dont le glisser-déposer a besoin). */
export type PlanDragItem = { type: 'task'; task: TaskItem } | { type: 'idea'; idea: { id: string; title: string } };

/** Où l'élément irait si on le lâchait maintenant. */
export type PlanTarget = { kind: 'tree'; drop: TreeDrop } | { kind: 'ideas' };

/** Identifiants des zones de dépôt (les lignes de tâche ont `task:<id>`). */
export const TASKS_END_ZONE = 'tasks-end';
export const IDEAS_ZONE = 'ideas';

export const taskDragId = (id: string) => `task:${id}`;
export const ideaDragId = (id: string) => `idea:${id}`;

export const PlanDragContext = createContext<{ dragging: PlanDragItem | null; target: PlanTarget | null }>({
  dragging: null,
  target: null,
});

export function usePlanDrag() {
  return useContext(PlanDragContext);
}

/** Repère à dessiner sur une ligne de tâche : avant, après, ou « dedans » (sous-tâche). */
export function useTreeHint(taskId: string): 'before' | 'after' | 'inside' | null {
  const { target } = usePlanDrag();
  if (target?.kind !== 'tree' || target.drop.position === 'end' || target.drop.targetId !== taskId) return null;
  return target.drop.position;
}

/** La tâche déplacée, pour placeInTree : une idée n'a pas encore d'identifiant de tâche. */
export function movedOf(item: PlanDragItem): { id: string; hasSubtasks: boolean } {
  return item.type === 'task' ? { id: item.task.id, hasSubtasks: item.task.subtasksTotal > 0 } : { id: NEW_TASK_ID, hasSubtasks: false };
}

/**
 * Dépôt sur une ligne de tâche selon la hauteur du pointeur : le haut de la ligne place avant, le bas
 * après, le milieu range dedans (sous-tâche). Si ce n'est pas permis (un seul niveau), le milieu
 * place avant ou après, selon la moitié. `null` : rien ne changerait.
 */
export function dropOnRow(nodes: TaskNode[], item: PlanDragItem, targetId: string, ratio: number): TreeDrop | null {
  const moved = movedOf(item);
  const edge: TreeDrop = { position: ratio < 0.5 ? 'before' : 'after', targetId };
  const drop: TreeDrop = ratio < 0.3 || ratio > 0.7 ? edge : { position: 'inside', targetId };
  if (placeInTree(nodes, moved, drop)) return drop;
  return drop.position === 'inside' && placeInTree(nodes, moved, edge) ? edge : null;
}
