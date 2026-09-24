import { isTauri } from '@tauri-apps/api/core';
import { createDb } from './client';
import { tauriDriver } from './tauri-driver';
import type { DbDriver } from './types';

export { createDb, sql } from './client';
export type { Db, DbDriver, Row, SqlValue, Statement } from './types';

/**
 * Dans l'app : le pont Tauri. Dans un simple navigateur en développement : une base en mémoire
 * (chargée à la demande, absente du build de production grâce à `import.meta.env.DEV`).
 */
function pickDriver(): DbDriver {
  if (!import.meta.env.DEV || isTauri()) return tauriDriver;
  const browser = import('./browser-driver').then((m) => m.browserDriver);
  return {
    query: async (sql, params) => (await browser).query(sql, params),
    execute: async (sql, params) => (await browser).execute(sql, params),
    batch: async (statements) => (await browser).batch(statements),
  };
}

/** Instance unique utilisée par toute l'application. */
export const db = createDb(pickDriver());
