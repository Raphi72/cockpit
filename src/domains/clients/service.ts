import type { Statement } from '@/core/db';
import type { BatchContext } from '@/core/batch';
import { normalizeClient, type ClientChoice } from './model';
import { insertClientStatement } from './repository';

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
