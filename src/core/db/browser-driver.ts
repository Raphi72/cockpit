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

/**
 * `?data` dans l'adresse : part d'une copie de vraies données (local-data/cockpit.db, ignoré par git,
 * préparée hors de l'app, index de recherche sans FTS5) au lieu d'une base vide. Tout reste en mémoire :
 * recharger la page repart de la copie, rien n'est jamais réécrit.
 */
async function initialBytes(): Promise<Uint8Array | null> {
  if (!new URLSearchParams(window.location.search).has('data')) return null;
  const response = await fetch('/local-data/cockpit.db');
  if (!response.ok) {
    console.warn('?data : local-data/cockpit.db introuvable, base vide.');
    return null;
  }
  return new Uint8Array(await response.arrayBuffer());
}

function open(): Promise<Database> {
  database ??= Promise.all([initSqlJs({ locateFile: () => wasmUrl }), initialBytes()]).then(([SQL, bytes]) => {
    const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    db.exec('PRAGMA foreign_keys = ON');
    // Comme au démarrage de l'app : seules les migrations pas encore passées s'appliquent.
    const current = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0);
    const paths = Object.keys(migrations).sort();
    for (const path of paths.slice(current)) db.exec(withoutFts5(migrations[path]!));
    db.exec(`PRAGMA user_version = ${paths.length}`);
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
