export type SqlValue = string | number | boolean | null;

export type Statement = { sql: string; params?: SqlValue[] };

export type Row = Record<string, unknown>;

/**
 * Accès brut à SQLite, sans aucune logique.
 * Implémenté par le pont Tauri en production et par `node:sqlite` dans les tests.
 */
export interface DbDriver {
  query(sql: string, params: SqlValue[]): Promise<Row[]>;
  execute(sql: string, params: SqlValue[]): Promise<{ rowsAffected: number }>;
  /** Exécute toutes les instructions dans une seule transaction. */
  batch(statements: Statement[]): Promise<void>;
}

/** Interface utilisée par les repositories. */
export interface Db {
  /** Renvoie les lignes avec des clés en camelCase (`budget_cents` → `budgetCents`). */
  query<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  queryOne<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  execute(sql: string, params?: SqlValue[]): Promise<{ rowsAffected: number }>;
  /** Tout ou rien : si une instruction échoue, aucune n'est appliquée. */
  batch(statements: Statement[]): Promise<void>;
}
