import type { SqlValue, Statement } from './types';

const toSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * Réinsère à l'identique une ligne lue par `db.query` (clés en camelCase) : annuler une suppression qui
 * emporte des lignes de plusieurs tables. Le nom de table et les colonnes viennent du code et de la base,
 * jamais de l'interface.
 */
export function reinsertRowStatement(table: string, row: Record<string, unknown>): Statement {
  const keys = Object.keys(row);
  return {
    sql: `INSERT INTO ${table} (${keys.map(toSnake).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    params: keys.map((key) => row[key] as SqlValue),
  };
}
