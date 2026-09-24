import { isISODate } from '@/core/dates';
import type { PaletteKey } from '@/ui/data/ColorDot';

/**
 * Transaction : mouvement réel sur un compte, montant signé (+ entrée, − sortie).
 * Les virements (2 lignes liées) et les ajustements de solde sont exclus des revenus et des dépenses.
 */
export type TransactionKind = 'income' | 'expense' | 'transfer' | 'adjustment';

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  income: 'Revenu',
  expense: 'Dépense',
  transfer: 'Virement',
  adjustment: 'Ajustement',
};

export const TRANSACTION_KINDS: TransactionKind[] = ['expense', 'income', 'transfer', 'adjustment'];

// ─── Catégories ─────────────────────────────────────────────────────────────

export type CategoryKind = 'income' | 'expense';

export type Category = { id: string; name: string; kind: CategoryKind };

export type CategoryWithUsage = Category & { transactionCount: number };

// ─── Transactions ───────────────────────────────────────────────────────────

/** Ligne telle qu'elle est stockée : sert aussi à la réinsérer après une suppression annulée. */
export type TransactionRow = {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amountCents: number;
  date: string;
  label: string;
  categoryId: string | null;
  projectId: string | null;
  paymentId: string | null;
  transferGroup: string | null;
  notes: string | null;
  createdAt: string;
};

export type TransactionListItem = TransactionRow & {
  accountName: string;
  categoryName: string | null;
  projectName: string | null;
  projectColor: PaletteKey | null;
  /** Virement : l'autre compte. */
  peerAccountId: string | null;
  peerAccountName: string | null;
};

/** Filtres de la liste : un mois ('YYYY-MM') et, au choix, un compte, un type, une catégorie. */
export type TransactionFilter = {
  month: string;
  accountId?: string;
  kind?: TransactionKind;
  categoryId?: string;
};

/** Saisie d'une transaction : le montant est toujours positif, le sens vient du type. */
export type TransactionInput = {
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number | null;
  /** Compte concerné ; pour un virement, le compte de départ. */
  accountId: string;
  /** Virement uniquement : le compte d'arrivée. */
  toAccountId: string | null;
  date: string;
  label: string;
  categoryId: string | null;
  projectId: string | null;
  notes: string | null;
};

export function validateTransaction(input: TransactionInput): Partial<Record<keyof TransactionInput, string>> {
  const errors: Partial<Record<keyof TransactionInput, string>> = {};
  if (input.amountCents === null || input.amountCents <= 0) errors.amountCents = 'Indique un montant.';
  if (input.kind !== 'transfer' && input.label.trim() === '') errors.label = 'Donne un libellé.';
  if (!isISODate(input.date)) errors.date = 'Date invalide.';
  if (input.kind === 'transfer' && (!input.toAccountId || input.toAccountId === input.accountId)) {
    errors.toAccountId = 'Choisis deux comptes différents.';
  }
  return errors;
}

/** Revenu → montant positif, dépense → négatif. */
export function signedAmount(kind: 'income' | 'expense', amountCents: number): number {
  return kind === 'income' ? Math.abs(amountCents) : -Math.abs(amountCents);
}

/** Libellé enregistré : celui saisi, ou « Virement » par défaut pour un virement. */
export function transactionLabel(input: Pick<TransactionInput, 'kind' | 'label'>): string {
  const label = input.label.trim();
  return label === '' && input.kind === 'transfer' ? 'Virement' : label;
}

/**
 * Formulaire pré-rempli à partir d'une transaction existante.
 * Pour un virement, le compte de départ est toujours celui qui perd l'argent.
 */
export function inputFromTransaction(item: TransactionListItem): TransactionInput {
  const outgoing = item.amountCents < 0;
  const isTransfer = item.kind === 'transfer';
  return {
    kind: item.kind === 'adjustment' ? 'income' : item.kind,
    amountCents: Math.abs(item.amountCents),
    accountId: isTransfer && !outgoing ? (item.peerAccountId ?? item.accountId) : item.accountId,
    toAccountId: isTransfer ? (outgoing ? item.peerAccountId : item.accountId) : null,
    date: item.date,
    label: item.label,
    categoryId: item.categoryId,
    projectId: item.projectId,
    notes: item.notes,
  };
}

export type TransactionTotals = { incomeCents: number; expenseCents: number };

/** Entrées et sorties d'une liste, hors virements et ajustements (qui ne sont ni gagnés ni dépensés). */
export function summarizeTransactions(items: Pick<TransactionRow, 'kind' | 'amountCents'>[]): TransactionTotals {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const item of items) {
    if (item.kind === 'income') incomeCents += item.amountCents;
    if (item.kind === 'expense') expenseCents += item.amountCents;
  }
  return { incomeCents, expenseCents };
}
