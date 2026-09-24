import type { Db, Statement } from '@/core/db';
import { normalizeClient } from '@/domains/clients/model';
import { insertClientStatement } from '@/domains/clients/repository';
import { insertPaymentStatement } from '@/domains/finance/payments/repository';
import { buildSchedule, type ClientChoice, type NewProjectInput } from './model';
import {
  countReceivedPayments,
  deleteProjectStatements,
  insertProjectStatement,
  updateProjectStatement,
} from './repository';

export type BatchContext = { now: string; today: string; newId: () => string };

/** Résout le client choisi ; un nouveau client ajoute son INSERT au lot. */
function resolveClient(choice: ClientChoice, ctx: BatchContext, statements: Statement[]): string | null {
  if (choice.kind === 'existing') return choice.id;
  if (choice.kind === 'none') return null;
  const clientId = ctx.newId();
  const client = normalizeClient({ name: choice.name, email: null, phone: null, notes: null });
  statements.push(insertClientStatement(clientId, client, ctx.now));
  return clientId;
}

/**
 * Création d'un projet en une seule transaction : client éventuel, projet, puis échéancier.
 * Tous les IDs sont générés ici, donc aucune instruction n'attend le résultat d'une autre.
 */
export function buildCreateProjectBatch(input: NewProjectInput, ctx: BatchContext) {
  const statements: Statement[] = [];
  const clientId = resolveClient(input.client, ctx, statements);
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
  const clientId = resolveClient(choice, ctx, statements);
  statements.push(updateProjectStatement(projectId, { clientId }, ctx.now));
  return statements;
}

export type DeleteProjectResult = 'deleted' | 'has-received-payments';

/** Un projet qui a déjà reçu de l'argent ne se supprime pas : on le passe en Terminé ou Annulé. */
export async function deleteProject(db: Db, projectId: string): Promise<DeleteProjectResult> {
  if ((await countReceivedPayments(db, projectId)) > 0) return 'has-received-payments';
  await db.batch(deleteProjectStatements(projectId));
  return 'deleted';
}
