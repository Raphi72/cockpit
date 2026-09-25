import type { BatchContext } from '@/core/batch';
import type { Statement } from '@/core/db';
import { NEW_TASK_ID, type TaskItem, type TreePlacement } from '@/domains/tasks/model';
import { deleteTaskStatement, insertTaskStatement, restoreTaskStatement, sortOrderStatements } from '@/domains/tasks/repository';
import type { Idea } from './model';
import { deleteIdeaStatement, insertIdeaStatement, restoreIdeaStatement } from './repository';

/**
 * L'idée devient une tâche du projet, sans date, et quitte les idées : les deux dans le même lot.
 * Sans `placement`, la tâche va en fin de liste ; avec (glisser-déposer), elle prend cette place,
 * éventuellement comme sous-tâche. Renvoie aussi de quoi annuler.
 */
export function buildIdeaToTaskBatch(
  idea: Idea,
  ctx: BatchContext,
  placement?: TreePlacement,
): { taskId: string; statements: Statement[] } {
  const taskId = ctx.newId();
  const orders = (placement?.orders ?? []).map((order) => (order.id === NEW_TASK_ID ? { ...order, id: taskId } : order));
  return {
    taskId,
    statements: [
      insertTaskStatement(
        taskId,
        {
          title: idea.title,
          projectId: idea.projectId,
          parentId: placement?.parentId ?? null,
          scheduledDate: null,
          dueDate: null,
          priority: 1,
          estimateMin: null,
          notes: null,
        },
        ctx.now,
      ),
      ...sortOrderStatements(orders, ctx.now),
      deleteIdeaStatement(idea.id),
    ],
  };
}

/** Annulation : la tâche créée disparaît, l'idée revient à sa place. */
export function buildUndoIdeaToTaskBatch(idea: Idea, taskId: string, now: string): Statement[] {
  return [deleteTaskStatement(taskId), restoreIdeaStatement(idea, now)];
}

/** Une tâche peut redevenir une idée : d'un projet, et sans sous-tâches (elles seraient perdues). */
export function canBecomeIdea(task: Pick<TaskItem, 'projectId' | 'subtasksTotal'>): boolean {
  return task.projectId !== null && task.subtasksTotal === 0;
}

/**
 * La tâche redevient une idée (glissée dans les idées) : seul son titre est gardé. Les deux dans
 * le même lot ; « Annuler » remet la tâche à l'identique (dates, notes, priorité, place).
 */
export function buildTaskToIdeaBatch(task: TaskItem, ctx: BatchContext): { ideaId: string; statements: Statement[] } {
  const ideaId = ctx.newId();
  return {
    ideaId,
    statements: [
      insertIdeaStatement({ id: ideaId, projectId: task.projectId!, title: task.title }, ctx.now),
      deleteTaskStatement(task.id),
    ],
  };
}

export function buildUndoTaskToIdeaBatch(task: TaskItem, ideaId: string, now: string): Statement[] {
  return [deleteIdeaStatement(ideaId), restoreTaskStatement(task, now)];
}
