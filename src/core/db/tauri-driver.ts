import { invoke } from '@tauri-apps/api/core';
import type { DbDriver, Row } from './types';

/** Pont vers les commandes Rust définies dans src-tauri/src/db/commands.rs. */
export const tauriDriver: DbDriver = {
  query: (sql, params) => invoke<Row[]>('db_query', { sql, params }),
  execute: (sql, params) => invoke<{ rowsAffected: number }>('db_execute', { sql, params }),
  batch: (statements) => invoke<void>('db_batch', { statements }),
};
