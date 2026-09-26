import type { Db, Statement } from '@/core/db';
import { EXPECTED_PAYMENT } from '@/domains/finance/payments/repository';
import type { Client, ClientInput, ClientListItem } from './model';

/** Paiements d'un client : ceux de ses projets, et ceux qui lui sont directement rattachés. */
const CLIENT_PAYMENTS = `FROM payments pay
               LEFT JOIN projects p ON p.id = pay.project_id
              WHERE (p.client_id = c.id OR pay.client_id = c.id)`;

/** Tous les clients, archivés compris (`archivedAt`), avec ce qu'ils ont payé et ce qu'on attend d'eux. */
export function listClients(db: Db): Promise<ClientListItem[]> {
  return db.query<ClientListItem>(
    `SELECT c.id, c.name, c.email, c.phone, c.notes, c.archived_at,
            (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count,
            (SELECT COALESCE(SUM(pay.amount_cents), 0) ${CLIENT_PAYMENTS} AND ${EXPECTED_PAYMENT}) AS due_cents,
            (SELECT COALESCE(SUM(pay.amount_cents), 0) ${CLIENT_PAYMENTS} AND pay.status = 'received') AS received_cents
     FROM clients c
     ORDER BY c.name COLLATE NOCASE`,
  );
}

/** Archiver (un horodatage) ou réactiver (`null`) un client. */
export function setClientArchivedStatement(id: string, archivedAt: string | null, now: string): Statement {
  return { sql: 'UPDATE clients SET archived_at = ?, updated_at = ? WHERE id = ?', params: [archivedAt, now, id] };
}

export function insertClientStatement(id: string, input: ClientInput, now: string): Statement {
  return {
    sql: `INSERT INTO clients (id, name, email, phone, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [id, input.name, input.email, input.phone, input.notes, now, now],
  };
}

export function updateClient(db: Db, id: string, input: ClientInput, now: string) {
  return db.execute(
    'UPDATE clients SET name = ?, email = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ?',
    [input.name, input.email, input.phone, input.notes, now, id],
  );
}

// ─── Suppression et annulation ──────────────────────────────────────────────

/** Ligne brute d'un client, pour le réinsérer à l'identique. */
export type ClientRow = Client & { archivedAt: string | null; createdAt: string };

export function getClientRow(db: Db, id: string): Promise<ClientRow | undefined> {
  return db.queryOne<ClientRow>(
    'SELECT id, name, email, phone, notes, archived_at, created_at FROM clients WHERE id = ?',
    [id],
  );
}

export function restoreClientStatement(row: ClientRow, now: string): Statement {
  return {
    sql: `INSERT INTO clients (id, name, email, phone, notes, archived_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [row.id, row.name, row.email, row.phone, row.notes, row.archivedAt, row.createdAt, now],
  };
}

/** Projets et encaissements directs du client : sa suppression les garde, sans client (ON DELETE SET NULL). */
export async function listClientLinks(db: Db, clientId: string): Promise<{ projectIds: string[]; paymentIds: string[] }> {
  const projects = await db.query<{ id: string }>('SELECT id FROM projects WHERE client_id = ?', [clientId]);
  const payments = await db.query<{ id: string }>('SELECT id FROM payments WHERE client_id = ?', [clientId]);
  return { projectIds: projects.map((p) => p.id), paymentIds: payments.map((p) => p.id) };
}

/** Rattache à nouveau des projets ou des encaissements au client restauré. */
export function relinkToClientStatement(table: 'projects' | 'payments', ids: string[], clientId: string): Statement {
  return {
    sql: `UPDATE ${table} SET client_id = ? WHERE id IN (SELECT value FROM json_each(?))`,
    params: [clientId, JSON.stringify(ids)],
  };
}

export function deleteClientStatement(id: string): Statement {
  return { sql: 'DELETE FROM clients WHERE id = ?', params: [id] };
}
