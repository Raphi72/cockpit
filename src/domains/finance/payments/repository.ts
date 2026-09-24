import type { Db, Statement } from '@/core/db';
import type { OverduePayment, Payment } from './model';

const COLUMNS = 'id, project_id, label, amount_cents, due_date, status, received_date, invoice_ref';

export function listProjectPayments(db: Db, projectId: string): Promise<Payment[]> {
  return db.query<Payment>(
    `SELECT ${COLUMNS} FROM payments WHERE project_id = ?
     ORDER BY due_date IS NULL, due_date, created_at`,
    [projectId],
  );
}

/** Encaissements non reçus dont la date prévue est passée. */
export function listOverduePayments(db: Db, today: string): Promise<OverduePayment[]> {
  return db.query<OverduePayment>(
    `SELECT pay.id, pay.project_id, pay.label, pay.amount_cents, pay.due_date, pay.status,
            pay.received_date, pay.invoice_ref,
            p.name AS project_name, COALESCE(c.name, dc.name) AS client_name
     FROM payments pay
     LEFT JOIN projects p ON p.id = pay.project_id
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN clients dc ON dc.id = pay.client_id
     WHERE pay.status <> 'received' AND pay.due_date < ?
     ORDER BY pay.due_date`,
    [today],
  );
}

export type NewPaymentRow = {
  id: string;
  projectId: string | null;
  label: string;
  amountCents: number;
  dueDate: string | null;
};

export function insertPaymentStatement(payment: NewPaymentRow, now: string): Statement {
  return {
    sql: `INSERT INTO payments (id, project_id, label, amount_cents, due_date, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'planned', ?, ?)`,
    params: [payment.id, payment.projectId, payment.label, payment.amountCents, payment.dueDate, now, now],
  };
}

/** Marque reçu à la date donnée, ou annule la réception (`null`). */
export function setPaymentReceived(db: Db, id: string, receivedDate: string | null, now: string) {
  return db.execute(
    `UPDATE payments SET status = ?, received_date = ?, updated_at = ? WHERE id = ?`,
    [receivedDate ? 'received' : 'planned', receivedDate, now, id],
  );
}
