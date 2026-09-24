import initSqlJs, { type Database, type SqlValue as SqlJsValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { withoutFts5 } from './fts-fallback';
import type { DbDriver, Row, SqlValue, Statement } from './types';

/**
 * Pilote de DÉVELOPPEMENT uniquement : quand l'interface tourne dans un simple navigateur
 * (sans Tauri), elle utilise une base SQLite en mémoire avec les mêmes migrations.
 * Sert à tester l'interface ; jamais utilisé dans l'application installée.
 */
const migrations = import.meta.glob<string>('/src-tauri/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

let database: Promise<Database> | null = null;

function open(): Promise<Database> {
  database ??= initSqlJs({ locateFile: () => wasmUrl }).then((SQL) => {
    const db = new SQL.Database();
    db.exec('PRAGMA foreign_keys = ON');
    for (const path of Object.keys(migrations).sort()) db.exec(withoutFts5(migrations[path]!));
    return db;
  });
  return database;
}

const bind = (params: SqlValue[]): SqlJsValue[] =>
  params.map((value) => (typeof value === 'boolean' ? Number(value) : value));

function run(db: Database, statement: Statement): number {
  const stmt = db.prepare(statement.sql);
  try {
    stmt.run(bind(statement.params ?? []));
  } finally {
    stmt.free();
  }
  return db.getRowsModified();
}

export const browserDriver: DbDriver = {
  async query(sql, params) {
    const db = await open();
    const stmt = db.prepare(sql);
    const rows: Row[] = [];
    try {
      stmt.bind(bind(params));
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  },
  async execute(sql, params) {
    const db = await open();
    return { rowsAffected: run(db, { sql, params }) };
  },
  async batch(statements) {
    const db = await open();
    db.exec('BEGIN');
    try {
      for (const statement of statements) run(db, statement);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};
