import type { BatchContext } from '@/core/batch';
import type { Statement } from '@/core/db';
import type { NewEventInput } from '@/domains/agenda/model';
import { deleteEventStatement, insertEventStatement } from '@/domains/agenda/repository';
import { deleteIdeaStatement, insertIdeaStatement } from '@/domains/ideas/repository';
import type { NewTaskInput } from '@/domains/tasks/model';
import { deleteTaskStatement, insertTaskStatement } from '@/domains/tasks/repository';
import type { InboxItem } from './model';
import { deleteInboxItemStatement, restoreInboxItemStatement } from './repository';

/**
 * Trier une capture : ce qu'elle devient est créé et elle quitte la boîte, dans le même lot.
 * Chaque tri renvoie l'identifiant créé, de quoi l'annuler (voir `buildUndoTriageBatch`).
 */
export function buildInboxToTaskBatch(
  item: InboxItem,
  input: NewTaskInput,
  ctx: BatchContext,
): { taskId: string; statements: Statement[] } {
  const taskId = ctx.newId();
  return { taskId, statements: [insertTaskStatement(taskId, input, ctx.now), deleteInboxItemStatement(item.id)] };
}

/** La capture devient une idée du projet choisi, avec son texte. */
export function buildInboxToIdeaBatch(
  item: InboxItem,
  projectId: string,
  ctx: BatchContext,
): { ideaId: string; statements: Statement[] } {
  const ideaId = ctx.newId();
  return {
    ideaId,
    statements: [insertIdeaStatement({ id: ideaId, projectId, title: item.text }, ctx.now), deleteInboxItemStatement(item.id)],
  };
}

export function buildInboxToEventBatch(
  item: InboxItem,
  input: NewEventInput,
  ctx: BatchContext,
): { eventId: string; statements: Statement[] } {
  const eventId = ctx.newId();
  return { eventId, statements: [insertEventStatement(eventId, input, ctx.now), deleteInboxItemStatement(item.id)] };
}

export type TriageResult = { kind: 'task' | 'idea' | 'event'; id: string };

/** Annulation d'un tri : ce qui a été créé disparaît, la capture revient à sa place dans la boîte. */
export function buildUndoTriageBatch(item: InboxItem, created: TriageResult, now: string): Statement[] {
  const remove = { task: deleteTaskStatement, idea: deleteIdeaStatement, event: deleteEventStatement }[created.kind];
  return [remove(created.id), restoreInboxItemStatement(item, now)];
}
