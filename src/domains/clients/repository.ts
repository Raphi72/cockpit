import type { Db, Statement } from '@/core/db';
import type { ClientInput, ClientListItem } from './model';

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

/** Les projets du client sont conservés, sans client (ON DELETE SET NULL). */
export function deleteClient(db: Db, id: string) {
  return db.execute('DELETE FROM clients WHERE id = ?', [id]);
}
