import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createDb } from '@/core/db/client';
import type { Db, DbDriver, Row, SqlValue } from '@/core/db/types';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../src-tauri/migrations');

// node:sqlite n'accepte pas les booléens : même conversion que le pont Rust (0 / 1).
const toInput = (params: SqlValue[]): SQLInputValue[] =>
  params.map((value) => (typeof value === 'boolean' ? Number(value) : value));

/** Pilote SQLite en mémoire, équivalent au pont Tauri, pour tester le vrai SQL. */
function createNodeDriver(database: DatabaseSync): DbDriver {
  return {
    async query(sql, params) {
      return database.prepare(sql).all(...toInput(params)) as Row[];
    },
    async execute(sql, params) {
      const result = database.prepare(sql).run(...toInput(params));
      return { rowsAffected: Number(result.changes) };
    },
    async batch(statements) {
      database.exec('BEGIN');
      try {
        for (const statement of statements) {
          database.prepare(statement.sql).run(...toInput(statement.params ?? []));
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

/** Base en mémoire avec toutes les migrations appliquées, comme au démarrage de l'app. */
export function createTestDb(): { db: Db; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) raw.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  return { db: createDb(createNodeDriver(raw)), raw };
}
