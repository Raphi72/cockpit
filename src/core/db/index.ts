import { createDb } from './client';
import { tauriDriver } from './tauri-driver';

export { createDb, sql } from './client';
export type { Db, DbDriver, Row, SqlValue, Statement } from './types';

/** Instance unique utilisée par toute l'application. */
export const db = createDb(tauriDriver);
