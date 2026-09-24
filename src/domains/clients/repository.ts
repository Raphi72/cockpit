import type { Db, Statement } from '@/core/db';
import type { Client, ClientInput, ClientListItem } from './model';

export function listClients(db: Db): Promise<ClientListItem[]> {
  return db.query<ClientListItem>(
    `SELECT c.id, c.name, c.email, c.phone, c.notes,
            (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count,
            (SELECT COALESCE(SUM(pay.amount_cents), 0)
               FROM payments pay
               LEFT JOIN projects p ON p.id = pay.project_id
              WHERE pay.status <> 'received' AND (p.client_id = c.id OR pay.client_id = c.id)) AS due_cents
     FROM clients c
     WHERE c.archived_at IS NULL
     ORDER BY c.name COLLATE NOCASE`,
  );
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
