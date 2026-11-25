import type { Db, Statement } from '@/core/db';
import type { InboxItem } from './model';

const COLUMNS = 'id, text, created_at';

/** Captures à trier, la plus récente en premier. */
export function listInboxItems(db: Db): Promise<InboxItem[]> {
  return db.query<InboxItem>(`SELECT ${COLUMNS} FROM inbox_items ORDER BY created_at DESC, rowid DESC`);
}

export function getInboxItem(db: Db, id: string): Promise<InboxItem | undefined> {
  return db.queryOne<InboxItem>(`SELECT ${COLUMNS} FROM inbox_items WHERE id = ?`, [id]);
}

export function insertInboxItemStatement(item: { id: string; text: string }, now: string): Statement {
  return {
    sql: 'INSERT INTO inbox_items (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)',
    params: [item.id, item.text, now, now],
  };
}

/** Réinsère une capture supprimée (ou triée) à l'identique, à sa place : annulation. */
export function restoreInboxItemStatement(item: InboxItem, now: string): Statement {
  return {
    sql: 'INSERT INTO inbox_items (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)',
    params: [item.id, item.text, item.createdAt, now],
  };
}

export function updateInboxTextStatement(id: string, text: string, now: string): Statement {
  return { sql: 'UPDATE inbox_items SET text = ?, updated_at = ? WHERE id = ?', params: [text, now, id] };
}

export function deleteInboxItemStatement(id: string): Statement {
  return { sql: 'DELETE FROM inbox_items WHERE id = ?', params: [id] };
}
