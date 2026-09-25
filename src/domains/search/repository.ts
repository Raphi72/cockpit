import type { Db, SqlValue } from '@/core/db';
import { SEARCH_LIMIT_PER_GROUP, searchTerms, toMatchQuery, type SearchEntity, type SearchResult } from './model';

/**
 * L'index est une table FTS5 dans l'app et les tests. Dans le navigateur de développement,
 * sql.js n'a pas FTS5 : c'est une table ordinaire (voir core/db/fts-fallback.ts), interrogée par LIKE.
 */
const ftsAvailable = new WeakMap<Db, Promise<boolean>>();

function hasFts(db: Db): Promise<boolean> {
  let known = ftsAvailable.get(db);
  if (!known) {
    known = db
      .queryOne<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'search_index'")
      .then((row) => /\bfts5\b/i.test(row?.sql ?? ''));
    ftsAvailable.set(db, known);
  }
  return known;
}

/** Éléments dont le texte correspond, avec leur pertinence. */
function hitsQuery(terms: string[], fts: boolean): { sql: string; params: SqlValue[] } {
  if (fts) {
    return {
      // Le titre compte dix fois plus que le reste (description, notes…).
      sql: `SELECT entity, entity_id AS id, bm25(search_index, 0.0, 0.0, 10.0, 1.0) AS score
            FROM search_index WHERE search_index MATCH ? ORDER BY score LIMIT 200`,
      params: [toMatchQuery(terms)],
    };
  }
  return {
    sql: `SELECT entity, entity_id AS id, 0 AS score FROM search_index
          WHERE ${terms.map(() => "(title || ' ' || body) LIKE ?").join(' AND ')} LIMIT 200`,
    params: terms.map((term) => `%${term}%`),
  };
}

type SearchRow = Omit<SearchResult, 'closed' | 'direct'> & { closed: number; direct: number };

/**
 * Recherche globale en une requête. Quand un projet ou un client correspond, ses éléments liés
 * (projets du client, tâches, idées, événements, encaissements) remontent aussi, après les correspondances directes.
 * Au plus SEARCH_LIMIT_PER_GROUP résultats par type : les directs, puis ceux encore ouverts.
 */
export async function searchEverything(db: Db, text: string, today: string): Promise<SearchResult[]> {
  const terms = searchTerms(text);
  if (terms.length === 0) return [];
  const hits = hitsQuery(terms, await hasFts(db));

  const rows = await db.query<SearchRow>(
    `WITH hits AS MATERIALIZED (${hits.sql}),
     matched_clients AS (SELECT id FROM hits WHERE entity = 'client'),
     scope AS (
       SELECT id FROM hits WHERE entity = 'project'
       UNION
       SELECT id FROM projects WHERE client_id IN (SELECT id FROM matched_clients)
     ),
     results AS (
       SELECT 'project' AS entity, p.id, p.name AS title, p.id AS project_id, c.name AS context, pt.color,
              p.deadline AS date,
              NULL AS amount_cents,
              (p.status IN ('done', 'cancelled') OR p.archived_at IS NOT NULL) AS closed,
              (h.id IS NOT NULL) AS direct, h.score
       FROM projects p
       JOIN project_types pt ON pt.id = p.type_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN hits h ON h.entity = 'project' AND h.id = p.id
       WHERE p.id IN (SELECT id FROM scope)

       UNION ALL
       SELECT 'task', t.id, t.title, t.project_id, p.name, pt.color, COALESCE(t.due_date, t.scheduled_date),
              NULL, t.status = 'done', h.id IS NOT NULL, h.score
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN project_types pt ON pt.id = p.type_id
       LEFT JOIN hits h ON h.entity = 'task' AND h.id = t.id
       WHERE h.id IS NOT NULL OR t.project_id IN (SELECT id FROM scope)

       UNION ALL
       SELECT 'idea', i.id, i.title, i.project_id, p.name, pt.color, NULL, NULL,
              (p.status IN ('done', 'cancelled') OR p.archived_at IS NOT NULL), h.id IS NOT NULL, h.score
       FROM ideas i
       JOIN projects p ON p.id = i.project_id
       JOIN project_types pt ON pt.id = p.type_id
       LEFT JOIN hits h ON h.entity = 'idea' AND h.id = i.id
       WHERE h.id IS NOT NULL OR i.project_id IN (SELECT id FROM scope)

       UNION ALL
       SELECT 'client', c.id, c.name, NULL, c.email, NULL, NULL, NULL, c.archived_at IS NOT NULL, 1, h.score
       FROM hits h
       JOIN clients c ON c.id = h.id
       WHERE h.entity = 'client'

       UNION ALL
       SELECT 'event', e.id, e.title, e.project_id, p.name, pt.color, e.starts_at,
              NULL, substr(COALESCE(e.ends_at, e.starts_at), 1, 10) < ?, h.id IS NOT NULL, h.score
       FROM events e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN project_types pt ON pt.id = p.type_id
       LEFT JOIN hits h ON h.entity = 'event' AND h.id = e.id
       WHERE h.id IS NOT NULL OR e.project_id IN (SELECT id FROM scope)

       UNION ALL
       SELECT 'payment', pay.id, pay.label, pay.project_id, COALESCE(p.name, pc.name), pt.color,
              COALESCE(pay.received_date, pay.due_date), pay.amount_cents,
              pay.status = 'received', h.id IS NOT NULL, h.score
       FROM payments pay
       LEFT JOIN projects p ON p.id = pay.project_id
       LEFT JOIN project_types pt ON pt.id = p.type_id
       LEFT JOIN clients pc ON pc.id = pay.client_id
       LEFT JOIN hits h ON h.entity = 'payment' AND h.id = pay.id
       WHERE h.id IS NOT NULL
          OR pay.project_id IN (SELECT id FROM scope)
          OR pay.client_id IN (SELECT id FROM matched_clients)

       UNION ALL
       SELECT 'transaction', tx.id, tx.label, tx.project_id, a.name, NULL, tx.date, tx.amount_cents, 0, 1, h.score
       FROM hits h
       JOIN transactions tx ON tx.id = h.id
       JOIN accounts a ON a.id = tx.account_id
       WHERE h.entity = 'transaction'
     ),
     -- Les directs d'abord, puis ce qui est encore ouvert : le plus proche en premier ;
     -- ce qui est clos (et l'historique des transactions) : le plus récent en premier.
     ranked AS (
       SELECT *, ROW_NUMBER() OVER (
         PARTITION BY entity
         ORDER BY direct DESC, closed ASC, COALESCE(score, 0) ASC, date IS NULL,
                  CASE WHEN closed OR entity = 'transaction' THEN '' ELSE date END ASC, date DESC, title
       ) AS position
       FROM results
     )
     SELECT entity, id, title, project_id, context, color, date, amount_cents, closed, direct, score
     FROM ranked
     WHERE position <= ?
     ORDER BY entity, position`,
    [...hits.params, today, SEARCH_LIMIT_PER_GROUP],
  );

  return rows.map((row) => ({
    ...row,
    entity: row.entity as SearchEntity,
    closed: Boolean(row.closed),
    direct: Boolean(row.direct),
  }));
}
