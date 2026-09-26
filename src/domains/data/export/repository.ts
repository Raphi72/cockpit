import type { Db } from '@/core/db';
import { EXPORT_TABLES, type PaymentExportRow, type TransactionExportRow } from './model';

type ExportTable = (typeof EXPORT_TABLES)[number]['table'];

/** Toutes les lignes d'une table, dans l'ordre de saisie. Le nom vient de `EXPORT_TABLES`, jamais de l'interface. */
export function readTable(db: Db, table: ExportTable): Promise<Record<string, unknown>[]> {
  return db.query<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY rowid`);
}

export async function getSchemaVersion(db: Db): Promise<number> {
  const row = await db.queryOne<{ userVersion: number }>('PRAGMA user_version');
  return row?.userVersion ?? 0;
}

/** Transactions, les plus anciennes d'abord ; dans un virement, la sortie avant l'entrée. */
export function listTransactionsForExport(db: Db): Promise<TransactionExportRow[]> {
  return db.query<TransactionExportRow>(
    `SELECT t.date, a.name AS account_name, t.kind, t.label, c.name AS category_name,
            p.name AS project_name, t.amount_cents, t.notes
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN transaction_categories c ON c.id = t.category_id
     LEFT JOIN projects p ON p.id = t.project_id
     ORDER BY t.date, t.created_at, t.amount_cents`,
  );
}

/** Encaissements, dans l'ordre de leur date (reçue, sinon prévue) ; ceux sans date à la fin. */
export async function listPaymentsForExport(db: Db): Promise<PaymentExportRow[]> {
  const rows = await db.query<Omit<PaymentExportRow, 'proposal'> & { proposal: number }>(
    `SELECT pay.label, p.name AS project_name, COALESCE(pc.name, c.name) AS client_name, pay.amount_cents,
            pay.due_date, pay.status, pay.received_date, pay.invoice_ref, pay.notes,
            COALESCE(p.status = 'proposal', 0) AS proposal
     FROM payments pay
     LEFT JOIN projects p ON p.id = pay.project_id
     LEFT JOIN clients pc ON pc.id = p.client_id
     LEFT JOIN clients c ON c.id = pay.client_id
     ORDER BY COALESCE(pay.received_date, pay.due_date) IS NULL, COALESCE(pay.received_date, pay.due_date),
              pay.created_at`,
  );
  return rows.map((row) => ({ ...row, proposal: row.proposal === 1 }));
}
