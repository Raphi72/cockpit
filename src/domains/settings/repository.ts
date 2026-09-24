import type { Db, Statement } from '@/core/db';

/** Réglages : une valeur JSON par clé (table `settings`). */
export async function getSetting<T>(db: Db, key: string): Promise<T | null> {
  const row = await db.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setSettingStatement(key: string, value: unknown): Statement {
  return {
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    params: [key, JSON.stringify(value)],
  };
}
