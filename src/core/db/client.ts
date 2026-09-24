import type { Db, DbDriver, Row, SqlValue, Statement } from './types';

const camelCache = new Map<string, string>();

function toCamel(key: string): string {
  let camel = camelCache.get(key);
  if (camel === undefined) {
    camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    camelCache.set(key, camel);
  }
  return camel;
}

function camelizeRow(row: Row): Row {
  const out: Row = {};
  for (const key in row) out[toCamel(key)] = row[key];
  return out;
}

export function createDb(driver: DbDriver): Db {
  const query = async <T>(sql: string, params: SqlValue[] = []): Promise<T[]> => {
    const rows = await driver.query(sql, params);
    return rows.map(camelizeRow) as T[];
  };

  return {
    query,
    async queryOne<T>(sql: string, params: SqlValue[] = []) {
      const rows = await query<T>(sql, params);
      return rows[0];
    },
    execute: (sql, params = []) => driver.execute(sql, params),
    batch: (statements) => driver.batch(statements),
  };
}

/**
 * Construit une instruction paramétrée à partir d'un template :
 * sql`UPDATE tasks SET status = ${status} WHERE id = ${id}`
 * Les valeurs ne sont jamais concaténées dans le SQL.
 */
export function sql(strings: TemplateStringsArray, ...values: SqlValue[]): Statement {
  return { sql: strings.join('?'), params: values };
}
