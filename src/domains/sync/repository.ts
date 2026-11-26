import type { Db, SqlValue, Statement } from '@/core/db';
import { newId } from '@/core/ids';
import { SYNC_TABLES, UNIQUE_RULES, conflictTitle, isNewer, type SyncRow } from './model';

// ─── État de l'appareil ─────────────────────────────────────────────────────

export async function getSyncState(db: Db, key: string): Promise<string | null> {
  const row = await db.queryOne<{ value: string | null }>('SELECT value FROM sync_state WHERE key = ?', [key]);
  return row?.value ?? null;
}

export function setSyncStateStatement(key: string, value: string): Statement {
  return { sql: 'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', params: [key, value] };
}

/** L'identifiant de cet appareil, créé à la première synchronisation. */
export async function ensureDeviceId(db: Db): Promise<string> {
  const existing = await getSyncState(db, 'device');
  if (existing) return existing;
  await db.batch([{ sql: "INSERT OR IGNORE INTO sync_state (key, value) VALUES ('device', ?)", params: [newId()] }]);
  return (await getSyncState(db, 'device'))!;
}

/** Ce qui a été lu de chaque autre appareil : le numéro du dernier fichier appliqué. */
export async function readCursors(db: Db): Promise<Record<string, number>> {
  const rows = await db.query<{ key: string; value: string }>("SELECT key, value FROM sync_state WHERE key LIKE 'cursor:%'");
  return Object.fromEntries(rows.map((row) => [row.key.slice('cursor:'.length), Number(row.value)]));
}

export async function schemaVersion(db: Db): Promise<number> {
  const row = await db.queryOne<{ userVersion: number }>('PRAGMA user_version');
  return row?.userVersion ?? 0;
}

// ─── Tables ─────────────────────────────────────────────────────────────────

export type TableInfo = { columns: string[]; pk: string[] };

const infoCache = new WeakMap<Db, Map<string, TableInfo>>();

/** Colonnes et clé d'une table synchronisée (lues une fois). Une table inconnue renvoie `null`. */
export async function tableInfo(db: Db, table: string): Promise<TableInfo | null> {
  if (!SYNC_TABLES.includes(table)) return null;
  let cache = infoCache.get(db);
  if (!cache) infoCache.set(db, (cache = new Map()));
  const known = cache.get(table);
  if (known) return known;
  const rows = await db.query<{ name: string; pk: number }>(`PRAGMA table_info(${table})`);
  const info = { columns: rows.map((r) => r.name), pk: rows.filter((r) => r.pk > 0).sort((a, b) => a.pk - b.pk).map((r) => r.name) };
  cache.set(table, info);
  return info;
}

const keyExpr = (info: TableInfo) => `json_array(${info.pk.join(', ')})`;

/** Les valeurs actuelles de lignes d'une table, par clé (noms de colonnes tels quels). */
export async function readRows(db: Db, table: string, keys: string[]): Promise<Map<string, Record<string, unknown>>> {
  const info = await tableInfo(db, table);
  if (!info || keys.length === 0) return new Map();
  const object = `json_object(${info.columns.map((c) => `'${c}', ${c}`).join(', ')})`;
  const rows = await db.query<{ rk: string; rd: string }>(
    `SELECT ${keyExpr(info)} AS rk, ${object} AS rd FROM ${table} WHERE ${keyExpr(info)} IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(keys)],
  );
  return new Map(rows.map((row) => [row.rk, JSON.parse(row.rd) as Record<string, unknown>]));
}

// ─── Envoi ──────────────────────────────────────────────────────────────────

export type PendingChange = { tbl: string; rowKey: string; changedAt: string; seq: number; deleted: number };

/** Les changements locaux pas encore envoyés, dans l'ordre. */
export function listPending(db: Db, afterSeq: number, limit: number): Promise<PendingChange[]> {
  return db.query<PendingChange>(
    'SELECT tbl, row_key, changed_at, seq, deleted FROM sync_rows WHERE device IS NULL AND seq > ? ORDER BY seq LIMIT ?',
    [afterSeq, limit],
  );
}

/** Les lignes à envoyer, avec leurs valeurs d'aujourd'hui (une ligne effacée depuis part comme supprimée). */
export async function buildSyncRows(db: Db, pending: PendingChange[]): Promise<SyncRow[]> {
  const byTable = new Map<string, string[]>();
  for (const change of pending) if (!change.deleted) byTable.set(change.tbl, [...(byTable.get(change.tbl) ?? []), change.rowKey]);
  const values = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [table, keys] of byTable) values.set(table, await readRows(db, table, keys));
  return pending.map((change) => ({
    t: change.tbl,
    k: change.rowKey,
    at: change.changedAt,
    d: change.deleted ? null : (values.get(change.tbl)?.get(change.rowKey) ?? null),
  }));
}

// ─── Réception ──────────────────────────────────────────────────────────────

type LocalChange = { tbl: string; rowKey: string; changedAt: string; device: string | null; seq: number };

const pairKey = (table: string, key: string) => `${table}\u001f${key}`;

async function localChanges(db: Db, rows: SyncRow[]): Promise<Map<string, LocalChange>> {
  const result = await db.query<LocalChange>(
    `SELECT tbl, row_key, changed_at, device, seq FROM sync_rows WHERE tbl || char(31) || row_key IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(rows.map((r) => pairKey(r.t, r.k)))],
  );
  return new Map(result.map((c) => [pairKey(c.tbl, c.rowKey), c]));
}

function upsertStatement(table: string, info: TableInfo, data: Record<string, unknown>): Statement | null {
  const columns = info.columns.filter((c) => c in data);
  if (!info.pk.every((c) => columns.includes(c))) return null;
  const others = columns.filter((c) => !info.pk.includes(c));
  const conflict = others.length
    ? `DO UPDATE SET ${others.map((c) => `${c} = excluded.${c}`).join(', ')}`
    : 'DO NOTHING';
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (${info.pk.join(', ')}) ${conflict}`,
    params: columns.map((c) => data[c] as SqlValue),
  };
}

function deleteStatement(table: string, info: TableInfo, key: string): Statement {
  const values = JSON.parse(key) as SqlValue[];
  return { sql: `DELETE FROM ${table} WHERE ${info.pk.map((c) => `${c} = ?`).join(' AND ')}`, params: values };
}

function syncRowStatement(row: SyncRow, device: string): Statement {
  return {
    sql: `INSERT INTO sync_rows (tbl, row_key, changed_at, device, seq, deleted) VALUES (?, ?, ?, ?, 0, ?)
          ON CONFLICT (tbl, row_key) DO UPDATE SET changed_at = excluded.changed_at, device = excluded.device, seq = 0, deleted = excluded.deleted`,
    params: [row.t, row.k, row.at, device, row.d === null ? 1 : 0],
  };
}

/** Une copie de page (« … (autre version) ») : nouvelle, hors de la favorite, du journal et des modèles. */
function pageCopyStatement(data: Record<string, unknown>, now: string): Statement {
  const copy = { ...data, id: newId(), title: conflictTitle(String(data.title ?? '')), pinned: 0, is_template: 0, journal_date: null, created_at: now, updated_at: now };
  const columns = Object.keys(copy);
  return { sql: `INSERT INTO pages (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, params: columns.map((c) => copy[c as keyof typeof copy] as SqlValue) };
}

/** Une ligne locale qui heurte une ligne reçue sur une contrainte d'unicité cède (voir UNIQUE_RULES). */
async function uniqueStatements(db: Db, row: SyncRow, info: TableInfo): Promise<Statement[]> {
  const statements: Statement[] = [];
  for (const rule of UNIQUE_RULES.filter((r) => r.table === row.t)) {
    const values = rule.columns.map((c) => row.d?.[c] as SqlValue);
    if (values.some((v) => v === null || v === undefined)) continue;
    const where = `${rule.columns.map((c) => `${c} = ?`).join(' AND ')} AND ${keyExpr(info)} <> ?`;
    const clashing = await db.query<{ rk: string }>(`SELECT ${keyExpr(info)} AS rk FROM ${row.t} WHERE ${where}`, [...values, row.k]);
    for (const { rk } of clashing) {
      const match = `WHERE ${info.pk.map((c) => `${c} = ?`).join(' AND ')}`;
      const keyValues = JSON.parse(rk) as SqlValue[];
      if (rule.resolve === 'delete') statements.push({ sql: `DELETE FROM ${row.t} ${match}`, params: keyValues });
      else if (rule.resolve === 'clear') statements.push({ sql: `UPDATE ${row.t} SET ${rule.target} = NULL ${match}`, params: keyValues });
      else statements.push({ sql: `UPDATE ${row.t} SET ${rule.target} = ${rule.target} || ' (2)' ${match}`, params: keyValues });
    }
  }
  return statements;
}

/**
 * Ce qu'il faut écrire pour appliquer un fichier reçu, en une transaction : les clés étrangères vérifiées à
 * la fin (l'ordre des lignes importe peu), les changements reçus non notés comme locaux, et seulement ceux
 * plus récents que la version locale. Une page modifiée des deux côtés garde l'autre version en copie.
 */
export async function applyStatements(
  db: Db,
  file: { device: string; rows: SyncRow[] },
  ctx: { ownDevice: string; pushedSeq: number; now: string },
): Promise<{ statements: Statement[]; applied: number }> {
  const locals = await localChanges(db, file.rows);
  const before: Statement[] = [];
  const during: Statement[] = [];
  const after: Statement[] = [];
  let applied = 0;
  const localPages = await readRows(
    db,
    'pages',
    file.rows.filter((r) => r.t === 'pages').map((r) => r.k),
  );

  for (const row of file.rows) {
    const info = await tableInfo(db, row.t);
    if (!info) continue;
    const local = locals.get(pairKey(row.t, row.k));
    const incomingWins = !local || isNewer({ at: row.at, device: file.device }, { at: local.changedAt, device: local.device ?? ctx.ownDevice });
    // Une page changée ici depuis le dernier envoi, et aussi là-bas : la version qui perd est gardée en copie.
    const pageConflict = row.t === 'pages' && local !== undefined && local.device === null && local.seq > ctx.pushedSeq;
    if (pageConflict) {
      const loser = incomingWins ? localPages.get(row.k) : row.d;
      const winner = incomingWins ? row.d : localPages.get(row.k);
      // Deux versions identiques (une base restaurée sur un autre appareil) : rien à garder en double.
      const same = loser && winner && loser.title === winner.title && loser.content === winner.content;
      if (loser && !same) after.push(pageCopyStatement(loser, ctx.now));
    }
    if (!incomingWins) continue;
    if (row.d === null) during.push(deleteStatement(row.t, info, row.k));
    else {
      const upsert = upsertStatement(row.t, info, row.d);
      if (!upsert) continue;
      before.push(...(await uniqueStatements(db, row, info)));
      during.push(upsert);
    }
    during.push(syncRowStatement(row, file.device));
    applied += 1;
  }

  return {
    applied,
    statements: [
      { sql: 'PRAGMA defer_foreign_keys = ON', params: [] },
      ...before,
      setSyncStateStatement('applying', '1'),
      ...during,
      { sql: "DELETE FROM sync_state WHERE key = 'applying'", params: [] },
      ...after,
    ],
  };
}
