import type { CreatedFromLine } from '@/app/create-store';
import type { BatchContext } from '@/core/batch';
import type { Statement } from '@/core/db';
import { deleteEventStatement } from '@/domains/agenda/repository';
import { deleteIdeaStatement, insertIdeaStatement } from '@/domains/ideas/repository';
import { deleteProjectStatements } from '@/domains/projects/repository';
import { deleteTaskStatement } from '@/domains/tasks/repository';

/**
 * Ce qu'une ligne de page devient (clic droit) : une tâche, un devoir, un événement ou un projet passent
 * par leur fenêtre de création ; une idée se crée tout de suite, dans le projet choisi.
 */
export function buildLineToIdeaBatch(text: string, projectId: string, ctx: BatchContext): { ideaId: string; statements: Statement[] } {
  const ideaId = ctx.newId();
  return { ideaId, statements: [insertIdeaStatement({ id: ideaId, projectId, title: text }, ctx.now)] };
}

/** « Annuler » une ligne transformée : ce qu'elle est devenue disparaît (la ligne, elle, revient dans la page). */
export function undoCreationStatements(created: Pick<CreatedFromLine, 'kind' | 'id'>): Statement[] {
  switch (created.kind) {
    case 'task':
      return [deleteTaskStatement(created.id)];
    case 'event':
      return [deleteEventStatement(created.id)];
    case 'idea':
      return [deleteIdeaStatement(created.id)];
    case 'project':
      return deleteProjectStatements(created.id);
  }
}
