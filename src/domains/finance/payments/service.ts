import type { BatchContext } from '@/core/batch';
import type { Db, Statement } from '@/core/db';
import { resolveClientChoice } from '@/domains/clients/service';
import type { TransactionRow } from '../transactions/model';
import {
  deleteTransactionStatement,
  insertPaymentIncomeStatement,
  insertTransactionStatement,
  listTransactionRows,
  updateTransactionStatement,
  type TransactionPatch,
} from '../transactions/repository';
import { incomeLabel, type OpenPaymentStatus, type PaymentInput, type PaymentListItem, type PaymentRow, type ReceiveInput } from './model';
import {
  deletePaymentStatement,
  getPaymentRow,
  insertPaymentStatement,
  markReceivedStatement,
  restorePaymentStatement,
  unmarkReceivedStatement,
  updatePaymentStatement,
  type PaymentPatch,
} from './repository';

// ─── Création et modification ───────────────────────────────────────────────

/** Nouvel encaissement, rattaché à un projet ou (sans projet) à un client créé au besoin. */
export function buildCreatePaymentBatch(input: PaymentInput, ctx: BatchContext) {
  const statements: Statement[] = [];
  const clientId = input.projectId ? null : resolveClientChoice(input.client, ctx, statements);
  const paymentId = ctx.newId();
  statements.push(
    insertPaymentStatement(
      {
        id: paymentId,
        projectId: input.projectId,
        clientId,
        label: input.label.trim(),
        amountCents: input.amountCents ?? 0,
        dueDate: input.dueDate,
        status: input.status,
        invoiceRef: input.invoiceRef?.trim() || null,
        notes: input.notes?.trim() || null,
      },
      ctx.now,
    ),
  );
  return { paymentId, statements };
}

/**
 * Modification. Si l'encaissement a déjà été reçu avec sa transaction, le montant, la date
 * de réception et le projet sont reportés sur celle-ci : les deux vues restent d'accord.
 */
export function buildUpdatePaymentBatch(existing: PaymentListItem, input: PaymentInput, ctx: BatchContext): Statement[] {
  const statements: Statement[] = [];
  const clientId = input.projectId ? null : resolveClientChoice(input.client, ctx, statements);
  const received = existing.status === 'received';
  const amountCents = input.amountCents ?? existing.amountCents;

  const patch: PaymentPatch = {
    projectId: input.projectId,
    clientId,
    label: input.label.trim(),
    amountCents,
    dueDate: input.dueDate,
    invoiceRef: input.invoiceRef?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  if (!received) patch.status = input.status;
  if (received && input.receivedDate) patch.receivedDate = input.receivedDate;
  statements.push(updatePaymentStatement(existing.id, patch, ctx.now));

  if (received && existing.transactionId) {
    const txPatch: TransactionPatch = {};
    if (amountCents !== existing.amountCents) txPatch.amountCents = amountCents;
    if (input.receivedDate && input.receivedDate !== existing.receivedDate) txPatch.date = input.receivedDate;
    if (input.projectId !== existing.projectId) txPatch.projectId = input.projectId;
    if (Object.keys(txPatch).length > 0) {
      statements.push(updateTransactionStatement(existing.transactionId, txPatch, ctx.now));
    }
  }
  return statements;
}

// ─── Réception (P4) ─────────────────────────────────────────────────────────

/**
 * « Marquer reçu » : dans un seul lot, l'encaissement passe à Reçu et, si un compte est choisi,
 * un revenu du même montant y est créé avec `payment_id`. Le lien garantit qu'il n'est compté qu'une fois.
 */
export function buildReceivePaymentBatch(
  payment: Pick<PaymentListItem, 'id' | 'label' | 'amountCents' | 'projectId' | 'projectName' | 'clientName'>,
  input: ReceiveInput,
  ctx: BatchContext,
): { transactionId: string | null; statements: Statement[] } {
  const statements = [markReceivedStatement(payment.id, input.receivedDate, ctx.now)];
  if (!input.accountId) return { transactionId: null, statements };

  const transactionId = ctx.newId();
  statements.push(
    insertPaymentIncomeStatement(
      {
        id: transactionId,
        accountId: input.accountId,
        amountCents: payment.amountCents,
        date: input.receivedDate,
        label: incomeLabel(payment),
        projectId: payment.projectId,
        paymentId: payment.id,
      },
      ctx.now,
    ),
  );
  return { transactionId, statements };
}

/** Annuler la réception supprime aussi la transaction liée. */
export function buildUnreceivePaymentBatch(
  paymentId: string,
  ctx: Pick<BatchContext, 'now'>,
  previousStatus: OpenPaymentStatus | null = null,
): Statement[] {
  return [
    unmarkReceivedStatement(paymentId, ctx.now, previousStatus),
    deleteTransactionStatement({ paymentId }),
  ];
}

// ─── Suppression et annulation ──────────────────────────────────────────────

/** État complet d'un encaissement et de sa transaction, pour pouvoir tout remettre en place. */
export type PaymentSnapshot = { payment: PaymentRow; transactions: TransactionRow[] };

export async function snapshotPayment(db: Db, paymentId: string): Promise<PaymentSnapshot | null> {
  const payment = await getPaymentRow(db, paymentId);
  if (!payment) return null;
  return { payment, transactions: await listTransactionRows(db, { paymentId }) };
}

/** Supprimer un encaissement supprime aussi le revenu qui lui est lié. */
export function buildDeletePaymentBatch(paymentId: string): Statement[] {
  return [deleteTransactionStatement({ paymentId }), deletePaymentStatement(paymentId)];
}

/** Annulation d'une suppression : l'encaissement et sa transaction reviennent à l'identique. */
export function buildRestorePaymentBatch(snapshot: PaymentSnapshot, now: string): Statement[] {
  return [
    restorePaymentStatement(snapshot.payment, now),
    ...snapshot.transactions.map((row) => insertTransactionStatement(row, now)),
  ];
}

/** Annulation d'une « annulation de réception » : l'encaissement redevient reçu, sa transaction revient. */
export function buildRestoreReceptionBatch(snapshot: PaymentSnapshot, now: string): Statement[] {
  return [
    markReceivedStatement(snapshot.payment.id, snapshot.payment.receivedDate!, now),
    ...snapshot.transactions.map((row) => insertTransactionStatement(row, now)),
  ];
}
