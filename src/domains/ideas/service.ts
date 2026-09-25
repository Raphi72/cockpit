import type { BatchContext } from '@/core/batch';
import type { Statement } from '@/core/db';
import { deleteTaskStatement, insertTaskStatement } from '@/domains/tasks/repository';
import type { Idea } from './model';
import { deleteIdeaStatement, restoreIdeaStatement } from './repository';

/**
 * L'idée devient une tâche du projet, sans date (placée en fin de liste), et quitte les idées :
 * les deux dans le même lot. Renvoie aussi de quoi annuler.
 */
export function buildIdeaToTaskBatch(idea: Idea, ctx: BatchContext): { taskId: string; statements: Statement[] } {
  const taskId = ctx.newId();
  return {
    taskId,
    statements: [
      insertTaskStatement(
        taskId,
        {
          title: idea.title,
          projectId: idea.projectId,
          scheduledDate: null,
          dueDate: null,
          priority: 1,
          estimateMin: null,
          notes: null,
        },
        ctx.now,
      ),
      deleteIdeaStatement(idea.id),
    ],
  };
}

/** Annulation : la tâche créée disparaît, l'idée revient à sa place. */
export function buildUndoIdeaToTaskBatch(idea: Idea, taskId: string, now: string): Statement[] {
  return [deleteTaskStatement(taskId), restoreIdeaStatement(idea, now)];
}
