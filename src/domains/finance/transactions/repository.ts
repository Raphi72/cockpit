import { monthRange } from '@/core/dates';
import type { Db, SqlValue, Statement } from '@/core/db';
import type {
  Category,
  CategoryKind,
  CategoryWithUsage,
  TransactionFilter,
  TransactionKind,
  TransactionListItem,
  TransactionRow,
} from './model';

// ─── Transactions ───────────────────────────────────────────────────────────

const ROW_COLUMNS = `t.id, t.account_id, t.kind, t.amount_cents, t.date, t.label, t.category_id, t.project_id,
  t.payment_id, t.transfer_group, t.notes, t.created_at`;

const LIST_SELECT = `
  SELECT ${ROW_COLUMNS},
         a.name AS account_name, c.name AS category_name, p.name AS project_name, pt.color AS project_color,
         peer.account_id AS peer_account_id, pa.name AS peer_account_name
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN transaction_categories c ON c.id = t.category_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN project_types pt ON pt.id = p.type_id
  LEFT JOIN transactions peer ON peer.transfer_group = t.transfer_group AND peer.id <> t.id
  LEFT JOIN accounts pa ON pa.id = peer.account_id`;

/**
 * Transactions d'un mois, les plus récentes d'abord.
 * Sans filtre de compte, un virement n'apparaît qu'une fois (sa ligne de départ) ;
 * avec un filtre de compte, on voit le côté de ce compte, signé.
 */
export function listTransactions(db: Db, filter: TransactionFilter): Promise<TransactionListItem[]> {
  const { from, to } = monthRange(filter.month);
  const where = ['t.date >= ?', 't.date < ?'];
  const params: SqlValue[] = [from, to];
  if (filter.accountId) {
    where.push('t.account_id = ?');
    params.push(filter.accountId);
  } else {
    where.push(`NOT (t.kind = 'transfer' AND t.amount_cents > 0)`);
  }
  if (filter.kind) {
    where.push('t.kind = ?');
    params.push(filter.kind);
  }
  if (filter.categoryId) {
    where.push('t.category_id = ?');
    params.push(filter.categoryId);
  }
  return db.query<TransactionListItem>(
    `${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.date DESC, t.created_at DESC`,
    params,
  );
}

/** Dépenses rattachées à un projet (fiche projet : dépenses liées et marge). */
export function listProjectExpenses(db: Db, projectId: string): Promise<TransactionListItem[]> {
  return db.query<TransactionListItem>(
    `${LIST_SELECT} WHERE t.project_id = ? AND t.kind = 'expense' ORDER BY t.date DESC, t.created_at DESC`,
    [projectId],
  );
}

export function getTransaction(db: Db, id: string): Promise<TransactionListItem | undefined> {
  return db.queryOne<TransactionListItem>(`${LIST_SELECT} WHERE t.id = ?`, [id]);
}

/** Lignes brutes à supprimer ensemble : une transaction, les 2 côtés d'un virement, ou celles d'un encaissement. */
export function listTransactionRows(
  db: Db,
  target: { id: string } | { transferGroup: string } | { paymentId: string },
): Promise<TransactionRow[]> {
  const [column, value] =
    'id' in target ? ['id', target.id] : 'transferGroup' in target ? ['transfer_group', target.transferGroup] : ['payment_id', target.paymentId];
  return db.query<TransactionRow>(`SELECT ${ROW_COLUMNS} FROM transactions t WHERE t.${column} = ?`, [value]);
}

export type NewTransactionRow = {
  id: string;
  accountId: string;
  kind: TransactionKind;
  amountCents: number;
  date: string;
  label: string;
  categoryId?: string | null;
  projectId?: string | null;
  paymentId?: string | null;
  transferGroup?: string | null;
  notes?: string | null;
  /** Conservé lors d'une réinsertion (annulation, modification d'un virement). */
  createdAt?: string;
};

export function insertTransactionStatement(row: NewTransactionRow, now: string): Statement {
  return {
    sql: `INSERT INTO transactions
            (id, account_id, kind, amount_cents, date, label, category_id, project_id, payment_id,
             transfer_group, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      row.id,
      row.accountId,
      row.kind,
      row.amountCents,
      row.date,
      row.label,
      row.categoryId ?? null,
      row.projectId ?? null,
      row.paymentId ?? null,
      row.transferGroup ?? null,
      row.notes ?? null,
      row.createdAt ?? now,
      now,
    ],
  };
}

/** Revenu créé à la réception d'un encaissement, rangé dans « Revenus client » si la catégorie existe encore. */
export function insertPaymentIncomeStatement(
  row: { id: string; accountId: string; amountCents: number; date: string; label: string; projectId: string | null; paymentId: string },
  now: string,
): Statement {
  return {
    sql: `INSERT INTO transactions
            (id, account_id, kind, amount_cents, date, label, category_id, project_id, payment_id, created_at, updated_at)
          VALUES (?, ?, 'income', ?, ?, ?,
                  (SELECT id FROM transaction_categories WHERE id = 'cat-client-income'), ?, ?, ?, ?)`,
    params: [row.id, row.accountId, row.amountCents, row.date, row.label, row.projectId, row.paymentId, now, now],
  };
}

export type TransactionPatch = Partial<{
  kind: 'income' | 'expense';
  accountId: string;
  amountCents: number;
  date: string;
  label: string;
  categoryId: string | null;
  projectId: string | null;
  notes: string | null;
}>;

const PATCH_COLUMNS: Record<keyof TransactionPatch, string> = {
  kind: 'kind',
  accountId: 'account_id',
  amountCents: 'amount_cents',
  date: 'date',
  label: 'label',
  categoryId: 'category_id',
  projectId: 'project_id',
  notes: 'notes',
};

export function updateTransactionStatement(id: string, patch: TransactionPatch, now: string): Statement {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const key of Object.keys(patch) as (keyof TransactionPatch)[]) {
    sets.push(`${PATCH_COLUMNS[key]} = ?`);
    params.push(patch[key] ?? null);
  }
  sets.push('updated_at = ?');
  params.push(now);
  return { sql: `UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, params: [...params, id] };
}

/** Supprime une transaction, les deux lignes d'un virement, ou le revenu lié à un encaissement. */
export function deleteTransactionStatement(
  target: { id: string } | { transferGroup: string } | { paymentId: string },
): Statement {
  if ('id' in target) return { sql: 'DELETE FROM transactions WHERE id = ?', params: [target.id] };
  if ('transferGroup' in target) {
    return { sql: 'DELETE FROM transactions WHERE transfer_group = ?', params: [target.transferGroup] };
  }
  return { sql: 'DELETE FROM transactions WHERE payment_id = ?', params: [target.paymentId] };
}

// ─── Catégories ─────────────────────────────────────────────────────────────

export function listCategories(db: Db): Promise<Category[]> {
  return db.query<Category>('SELECT id, name, kind FROM transaction_categories ORDER BY kind, name COLLATE NOCASE');
}

export function listCategoriesWithUsage(db: Db): Promise<CategoryWithUsage[]> {
  return db.query<CategoryWithUsage>(
    `SELECT c.id, c.name, c.kind,
            (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS transaction_count
     FROM transaction_categories c
     ORDER BY c.kind, c.name COLLATE NOCASE`,
  );
}

export function insertCategory(db: Db, category: { id: string; name: string; kind: CategoryKind }) {
  return db.execute('INSERT INTO transaction_categories (id, name, kind) VALUES (?, ?, ?)', [
    category.id,
    category.name,
    category.kind,
  ]);
}

export function renameCategory(db: Db, id: string, name: string) {
  return db.execute('UPDATE transaction_categories SET name = ? WHERE id = ?', [name, id]);
}

/** Les transactions de la catégorie restent, sans catégorie (ON DELETE SET NULL). */
export function deleteCategory(db: Db, id: string) {
  return db.execute('DELETE FROM transaction_categories WHERE id = ?', [id]);
}
