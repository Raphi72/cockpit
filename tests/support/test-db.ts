import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createDb } from '@/core/db/client';
import { withoutFts5 } from '@/core/db/fts-fallback';
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

/** Contenu des migrations, dans l'ordre (0001, 0002…). */
export function readMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
}

type TestDbOptions = {
  /** Nombre de migrations à appliquer (toutes par défaut) : pour tester une migration sur une base existante. */
  migrations?: number;
  /** Faux : comme dans le navigateur de développement, sans FTS5. */
  fts?: boolean;
};

/** Base en mémoire avec toutes les migrations appliquées, comme au démarrage de l'app. */
export function createTestDb(options: TestDbOptions = {}): { db: Db; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const migrations = readMigrations().slice(0, options.migrations);
  for (const migration of migrations) raw.exec(options.fts === false ? withoutFts5(migration) : migration);
  // Comme au démarrage de l'app (src-tauri/src/db/migrations.rs) : la version du schéma suit les migrations.
  raw.exec(`PRAGMA user_version = ${migrations.length}`);
  return { db: createDb(createNodeDriver(raw)), raw };
}
