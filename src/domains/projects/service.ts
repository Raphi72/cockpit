import type { BatchContext } from '@/core/batch';
import type { Db, Statement } from '@/core/db';
import { resolveClientChoice } from '@/domains/clients/service';
import type { PaymentRow } from '@/domains/finance/payments/model';
import {
  insertPaymentStatement,
  listOpenProjectPaymentRows,
  restorePaymentStatement,
} from '@/domains/finance/payments/repository';
import type { TaskItem } from '@/domains/tasks/model';
import { listProjectTasks, restoreTaskStatement } from '@/domains/tasks/repository';
import { buildSchedule, type ClientChoice, type NewProjectInput } from './model';
import {
  countReceivedPayments,
  deleteProjectStatements,
  getProjectRow,
  insertProjectStatement,
  listProjectLinks,
  relinkToProjectStatement,
  restoreProjectStatement,
  updateProjectStatement,
  type ProjectRow,
} from './repository';

export type { BatchContext };

/**
 * Création d'un projet en une seule transaction : client éventuel, projet, puis échéancier.
 * Tous les IDs sont générés ici, donc aucune instruction n'attend le résultat d'une autre.
 */
export function buildCreateProjectBatch(input: NewProjectInput, ctx: BatchContext) {
  const statements: Statement[] = [];
  const clientId = resolveClientChoice(input.client, ctx, statements);
  const projectId = ctx.newId();

  statements.push(
    insertProjectStatement(
      {
        id: projectId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        clientId,
        typeId: input.typeId,
        status: input.status,
        priority: input.priority,
        startDate: input.startDate,
        deadline: input.deadline,
        budgetCents: input.budgetCents,
      },
      ctx.now,
    ),
  );

  if (input.budgetCents) {
    const schedule = buildSchedule(input.schedule, input.budgetCents, {
      startDate: input.startDate,
      deadline: input.deadline,
      today: ctx.today,
    });
    for (const payment of schedule) {
      statements.push(insertPaymentStatement({ id: ctx.newId(), projectId, ...payment }, ctx.now));
    }
  }

  return { projectId, statements };
}

/** Change le client d'un projet, en créant le client au passage si besoin. */
export function buildSetClientBatch(projectId: string, choice: ClientChoice, ctx: BatchContext): Statement[] {
  const statements: Statement[] = [];
  const clientId = resolveClientChoice(choice, ctx, statements);
  statements.push(updateProjectStatement(projectId, { clientId }, ctx.now));
  return statements;
}

/** Tout ce qu'une suppression de projet emporte ou détache, pour pouvoir l'annuler. */
export type ProjectSnapshot = {
  project: ProjectRow;
  tasks: TaskItem[];
  payments: PaymentRow[];
  eventIds: string[];
  transactionIds: string[];
};

export type DeleteProjectResult =
  | { status: 'deleted'; snapshot: ProjectSnapshot }
  | { status: 'has-received-payments' }
  | { status: 'missing' };

/**
 * Un projet qui a déjà reçu de l'argent ne se supprime pas : on le passe en Terminé ou Annulé.
 * Sinon il part avec ses tâches et ses échéances non reçues ; l'état d'avant est renvoyé pour « Annuler ».
 */
export async function deleteProject(db: Db, projectId: string): Promise<DeleteProjectResult> {
  if ((await countReceivedPayments(db, projectId)) > 0) return { status: 'has-received-payments' };
  const project = await getProjectRow(db, projectId);
  if (!project) return { status: 'missing' };
  const snapshot: ProjectSnapshot = {
    project,
    tasks: await listProjectTasks(db, projectId),
    payments: await listOpenProjectPaymentRows(db, projectId),
    ...(await listProjectLinks(db, projectId)),
  };
  await db.batch(deleteProjectStatements(projectId));
  return { status: 'deleted', snapshot };
}

/** Annulation d'une suppression : le projet, ses tâches, ses échéances et ses rattachements reviennent. */
export function buildRestoreProjectBatch(snapshot: ProjectSnapshot, now: string): Statement[] {
  const projectId = snapshot.project.id;
  return [
    restoreProjectStatement(snapshot.project, now),
    ...snapshot.tasks.map((task) => restoreTaskStatement(task, now)),
    ...snapshot.payments.map((payment) => restorePaymentStatement(payment, now)),
    relinkToProjectStatement('events', snapshot.eventIds, projectId),
    relinkToProjectStatement('transactions', snapshot.transactionIds, projectId),
  ];
}
