import { sqlDaysModifier } from '@/core/dates';
import type { Db, SqlValue, Statement } from '@/core/db';
import type { OpenPaymentStatus, PaymentListItem, PaymentRow } from './model';

/**
 * Encaissement réellement attendu : pas encore reçu, et pas lié à un projet en Proposition
 * (devis envoyé, pas signé : de l'argent possible, pas de l'argent dû). Il compte dès que le projet
 * passe en Prévu ou En cours. S'écrit avec `pay` = payments et `p` = son projet (LEFT JOIN).
 */
export const EXPECTED_PAYMENT = `pay.status <> 'received' AND (p.status IS NULL OR p.status <> 'proposal')`;

const LIST_SELECT = `
  SELECT pay.id, pay.project_id, pay.client_id, pay.label, pay.amount_cents, pay.due_date, pay.status,
         pay.received_date, pay.invoice_ref, pay.notes,
         p.name AS project_name, pt.color AS project_color, COALESCE(c.name, dc.name) AS client_name,
         tx.id AS transaction_id, ta.name AS transaction_account_name
  FROM payments pay
  LEFT JOIN projects p ON p.id = pay.project_id
  LEFT JOIN project_types pt ON pt.id = p.type_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN clients dc ON dc.id = pay.client_id
  LEFT JOIN transactions tx ON tx.payment_id = pay.id
  LEFT JOIN accounts ta ON ta.id = tx.account_id`;

export function listProjectPayments(db: Db, projectId: string): Promise<PaymentListItem[]> {
  return db.query<PaymentListItem>(
    `${LIST_SELECT} WHERE pay.project_id = ?
     ORDER BY pay.due_date IS NULL, pay.due_date, pay.created_at`,
    [projectId],
  );
}

/** Tout ce qui reste à recevoir, par date prévue (les retards arrivent donc en tête). */
export function listOpenPayments(db: Db): Promise<PaymentListItem[]> {
  return db.query<PaymentListItem>(
    `${LIST_SELECT} WHERE ${EXPECTED_PAYMENT}
     ORDER BY pay.due_date IS NULL, pay.due_date, pay.created_at`,
  );
}

/** Encaissements reçus, les plus récents d'abord. */
export function listReceivedPayments(db: Db, limit = 200): Promise<PaymentListItem[]> {
  return db.query<PaymentListItem>(
    `${LIST_SELECT} WHERE pay.status = 'received'
     ORDER BY pay.received_date DESC, pay.updated_at DESC
     LIMIT ?`,
    [limit],
  );
}

/** Encaissements attendus dont la date prévue est passée. */
export function listOverduePayments(db: Db, today: string): Promise<PaymentListItem[]> {
  return db.query<PaymentListItem>(
    `${LIST_SELECT} WHERE ${EXPECTED_PAYMENT} AND pay.due_date < ?
     ORDER BY pay.due_date`,
    [today],
  );
}

export function getPayment(db: Db, id: string): Promise<PaymentListItem | undefined> {
  return db.queryOne<PaymentListItem>(`${LIST_SELECT} WHERE pay.id = ?`, [id]);
}

export function getPaymentRow(db: Db, id: string): Promise<PaymentRow | undefined> {
  return db.queryOne<PaymentRow>(
    `SELECT id, project_id, client_id, label, amount_cents, due_date, status, received_date, invoice_ref, notes, created_at
     FROM payments WHERE id = ?`,
    [id],
  );
}

/** Échéances non reçues d'un projet, lignes brutes : elles disparaissent avec lui. */
export function listOpenProjectPaymentRows(db: Db, projectId: string): Promise<PaymentRow[]> {
  return db.query<PaymentRow>(
    `SELECT id, project_id, client_id, label, amount_cents, due_date, status, received_date, invoice_ref, notes, created_at
     FROM payments WHERE project_id = ? AND status <> 'received'`,
    [projectId],
  );
}

export type NewPaymentRow = {
  id: string;
  projectId: string | null;
  clientId?: string | null;
  label: string;
  amountCents: number;
  dueDate: string | null;
  status?: OpenPaymentStatus;
  invoiceRef?: string | null;
  notes?: string | null;
};

export function insertPaymentStatement(payment: NewPaymentRow, now: string): Statement {
  return {
    sql: `INSERT INTO payments
            (id, project_id, client_id, label, amount_cents, due_date, status, invoice_ref, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      payment.id,
      payment.projectId,
      payment.projectId ? null : (payment.clientId ?? null),
      payment.label,
      payment.amountCents,
      payment.dueDate,
      payment.status ?? 'planned',
      payment.invoiceRef ?? null,
      payment.notes ?? null,
      now,
      now,
    ],
  };
}

/** Réinsère un encaissement supprimé à l'identique (annulation). */
export function restorePaymentStatement(row: PaymentRow, now: string): Statement {
  return {
    sql: `INSERT INTO payments
            (id, project_id, client_id, label, amount_cents, due_date, status, received_date, invoice_ref, notes,
             created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      row.id,
      row.projectId,
      row.clientId,
      row.label,
      row.amountCents,
      row.dueDate,
      row.status,
      row.receivedDate,
      row.invoiceRef,
      row.notes,
      row.createdAt,
      now,
    ],
  };
}

export type PaymentPatch = Partial<{
  projectId: string | null;
  clientId: string | null;
  label: string;
  amountCents: number;
  dueDate: string | null;
  status: OpenPaymentStatus;
  receivedDate: string;
  invoiceRef: string | null;
  notes: string | null;
}>;

const PATCH_COLUMNS: Record<keyof PaymentPatch, string> = {
  projectId: 'project_id',
  clientId: 'client_id',
  label: 'label',
  amountCents: 'amount_cents',
  dueDate: 'due_date',
  status: 'status',
  receivedDate: 'received_date',
  invoiceRef: 'invoice_ref',
  notes: 'notes',
};

export function updatePaymentStatement(id: string, patch: PaymentPatch, now: string): Statement {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const key of Object.keys(patch) as (keyof PaymentPatch)[]) {
    sets.push(`${PATCH_COLUMNS[key]} = ?`);
    params.push(patch[key] ?? null);
  }
  sets.push('updated_at = ?');
  params.push(now);
  return { sql: `UPDATE payments SET ${sets.join(', ')} WHERE id = ?`, params: [...params, id] };
}

/** Glisser dans le calendrier : la date prévue se décale de `days` jours (jamais pour un encaissement reçu). */
export function shiftPaymentDueStatement(id: string, days: number, now: string): Statement {
  return {
    sql: `UPDATE payments SET due_date = date(due_date, ?), updated_at = ? WHERE id = ? AND status <> 'received'`,
    params: [sqlDaysModifier(days), now, id],
  };
}

export function markReceivedStatement(id: string, receivedDate: string, now: string): Statement {
  return {
    sql: `UPDATE payments SET status = 'received', received_date = ?, updated_at = ? WHERE id = ?`,
    params: [receivedDate, now, id],
  };
}

/**
 * Annule la réception. Sans statut précisé, un encaissement qui a un n° de facture
 * revient « En attente » (facture envoyée), sinon « Prévu ».
 */
export function unmarkReceivedStatement(id: string, now: string, status: OpenPaymentStatus | null = null): Statement {
  return {
    sql: `UPDATE payments
          SET status = COALESCE(?, CASE WHEN invoice_ref IS NULL THEN 'planned' ELSE 'pending' END),
              received_date = NULL, updated_at = ?
          WHERE id = ?`,
    params: [status, now, id],
  };
}

export function deletePaymentStatement(id: string): Statement {
  return { sql: 'DELETE FROM payments WHERE id = ?', params: [id] };
}
