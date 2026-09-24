import type { Db, Statement } from '@/core/db';
import type { BatchContext } from '@/core/batch';
import { normalizeClient, type ClientChoice } from './model';
import {
  deleteClientStatement,
  getClientRow,
  insertClientStatement,
  listClientLinks,
  relinkToClientStatement,
  restoreClientStatement,
  type ClientRow,
} from './repository';

/**
 * Résout le client choisi dans un formulaire (projet, encaissement…) :
 * un nouveau client ajoute son INSERT au lot et reçoit son ID tout de suite.
 */
export function resolveClientChoice(choice: ClientChoice, ctx: BatchContext, statements: Statement[]): string | null {
  if (choice.kind === 'existing') return choice.id;
  if (choice.kind === 'none') return null;
  const clientId = ctx.newId();
  const client = normalizeClient({ name: choice.name, email: null, phone: null, notes: null });
  statements.push(insertClientStatement(clientId, client, ctx.now));
  return clientId;
}

/** Ce que la suppression d'un client détache, pour pouvoir l'annuler. */
export type ClientSnapshot = { client: ClientRow; projectIds: string[]; paymentIds: string[] };

/** Supprime le client : ses projets et encaissements sont conservés, sans client. Renvoie l'état d'avant. */
export async function deleteClient(db: Db, clientId: string): Promise<ClientSnapshot | null> {
  const client = await getClientRow(db, clientId);
  if (!client) return null;
  const snapshot = { client, ...(await listClientLinks(db, clientId)) };
  await db.batch([deleteClientStatement(clientId)]);
  return snapshot;
}

/** Annulation : le client revient et retrouve ses projets et ses encaissements. */
export function buildRestoreClientBatch(snapshot: ClientSnapshot, now: string): Statement[] {
  const clientId = snapshot.client.id;
  return [
    restoreClientStatement(snapshot.client, now),
    relinkToClientStatement('projects', snapshot.projectIds, clientId),
    relinkToClientStatement('payments', snapshot.paymentIds, clientId),
  ];
}
