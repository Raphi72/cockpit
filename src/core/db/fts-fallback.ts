/**
 * sql.js, utilisé par le navigateur de développement, est compilé sans FTS5 : la table virtuelle
 * de recherche y devient une table ordinaire aux mêmes colonnes. Les triggers qui la remplissent
 * restent identiques ; seule la requête change (LIKE au lieu de MATCH, voir domains/search/repository.ts).
 */
export function withoutFts5(migration: string): string {
  return migration.replace(
    /CREATE VIRTUAL TABLE (\w+) USING fts5\(([\s\S]*?)\);/g,
    (_statement, table: string, definition: string) => {
      const columns = definition
        .split(',')
        .map((part) => part.replace(/--.*$/gm, '').trim())
        .filter((part) => part !== '' && !part.includes('='))
        .map((part) => part.split(/\s+/)[0]);
      return `CREATE TABLE ${table} (${columns.join(', ')});`;
    },
  );
}
