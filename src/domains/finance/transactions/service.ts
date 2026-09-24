import type { BatchContext } from '@/core/batch';
import type { Statement } from '@/core/db';
import { signedAmount, transactionLabel, type TransactionInput, type TransactionListItem } from './model';
import { deleteTransactionStatement, insertTransactionStatement, updateTransactionStatement } from './repository';

/**
 * Nouvelle transaction. Un virement produit deux lignes `transfer` (sortie puis entrée)
 * qui partagent un `transfer_group` : elles sont écrites dans le même lot, donc jamais l'une sans l'autre.
 */
export function buildCreateTransactionBatch(
  input: TransactionInput,
  ctx: BatchContext,
  options: { createdAt?: string } = {},
): Statement[] {
  const amount = Math.abs(input.amountCents ?? 0);
  const label = transactionLabel(input);
  const notes = input.notes?.trim() || null;

  if (input.kind === 'transfer') {
    const group = ctx.newId();
    const common = { kind: 'transfer' as const, date: input.date, label, notes, transferGroup: group, createdAt: options.createdAt };
    return [
      insertTransactionStatement({ ...common, id: ctx.newId(), accountId: input.accountId, amountCents: -amount }, ctx.now),
      insertTransactionStatement({ ...common, id: ctx.newId(), accountId: input.toAccountId!, amountCents: amount }, ctx.now),
    ];
  }

  return [
    insertTransactionStatement(
      {
        id: ctx.newId(),
        accountId: input.accountId,
        kind: input.kind,
        amountCents: signedAmount(input.kind, amount),
        date: input.date,
        label,
        categoryId: input.categoryId,
        projectId: input.projectId,
        notes,
        createdAt: options.createdAt,
      },
      ctx.now,
    ),
  ];
}

/** Cible de suppression : la ligne, ou les deux lignes d'un virement. */
export function deletionTarget(item: Pick<TransactionListItem, 'id' | 'transferGroup'>) {
  return item.transferGroup ? { transferGroup: item.transferGroup } : { id: item.id };
}

/**
 * Modification. Revenu ↔ dépense : la ligne est simplement mise à jour (son lien avec
 * un encaissement est conservé). Dès qu'un virement est en jeu, les lignes sont remplacées.
 */
export function buildUpdateTransactionBatch(
  existing: TransactionListItem,
  input: TransactionInput,
  ctx: BatchContext,
): Statement[] {
  if (existing.kind === 'adjustment') {
    return [
      updateTransactionStatement(
        existing.id,
        { date: input.date, label: input.label.trim() || existing.label, notes: input.notes?.trim() || null },
        ctx.now,
      ),
    ];
  }

  if (existing.kind === 'transfer' || input.kind === 'transfer') {
    return [
      deleteTransactionStatement(deletionTarget(existing)),
      ...buildCreateTransactionBatch(input, ctx, { createdAt: existing.createdAt }),
    ];
  }

  const kind = input.kind;
  return [
    updateTransactionStatement(
      existing.id,
      {
        kind,
        accountId: input.accountId,
        amountCents: signedAmount(kind, input.amountCents ?? 0),
        date: input.date,
        label: transactionLabel(input),
        categoryId: input.categoryId,
        projectId: input.projectId,
        notes: input.notes?.trim() || null,
      },
      ctx.now,
    ),
  ];
}
