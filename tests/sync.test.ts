import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import type { Db } from '@/core/db/types';
import { MAX_FILE_BYTES, SYNC_TABLES, UNIQUE_RULES, changeFileName, filesToRead, isNewer, normalizeKeyCode, parseChangeFileName } from '@/domains/sync/model';
import { ensureDeviceId, getSyncState } from '@/domains/sync/repository';
import { pullChanges, pushChanges, resetDeviceStatements, syncOnce, type SyncTransport } from '@/domains/sync/service';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';

/** Un faux Google Drive partagé par les appareils : des fichiers en clair, par nom. */
function fakeDrive() {
  const files: { id: string; name: string; text: string }[] = [];
  const transport: SyncTransport = {
    list: async () => files.map(({ id, name }) => ({ id, name })),
    download: async (id) => files.find((f) => f.id === id)!.text,
    upload: async (name, text) => {
      files.push({ id: `f${files.length + 1}`, name, text });
    },
  };
  return { files, transport };
}

const task = (id: string, title: string) =>
  sql`INSERT INTO tasks (id, title, status, priority, sort_order, created_at, updated_at) VALUES (${id}, ${title}, 'todo', 1, 1, ${NOW}, ${NOW})`;

const page = (id: string, title: string, content: string, journal: string | null = null) =>
  sql`INSERT INTO pages (id, title, content, plain_text, journal_date, sort_order, created_at, updated_at)
      VALUES (${id}, ${title}, ${content}, '', ${journal}, 1, ${NOW}, ${NOW})`;

const titles = async (db: Db, table: 'tasks' | 'pages') => (await db.query<{ title: string }>(`SELECT title FROM ${table} ORDER BY title`)).map((r) => r.title);

/** Fixe l'heure du dernier changement d'une ligne (pour décider qui est le plus récent). */
const stamp = (db: Db, table: string, id: string, at: string) =>
  db.batch([sql`UPDATE sync_rows SET changed_at = ${at} WHERE tbl = ${table} AND row_key = ${JSON.stringify([id])}`]);

describe('synchronisation : règles', () => {
  it('nomme les fichiers et choisit ceux à lire', () => {
    expect(changeFileName('abc', 42)).toBe('abc-000000000042.ckp');
    expect(parseChangeFileName('dev-a-b-000000000042.ckp')).toEqual({ device: 'dev-a-b', seq: 42 });
    expect(parseChangeFileName('key-check')).toBeNull();
    const files = [
      { id: '1', name: changeFileName('b', 3) },
      { id: '2', name: changeFileName('a', 9) },
      { id: '3', name: changeFileName('b', 1) },
      { id: '4', name: changeFileName('moi', 5) },
      { id: '5', name: changeFileName('a', 4) },
    ];
    expect(filesToRead(files, 'moi', { a: 4 }).map((f) => f.id)).toEqual(['2', '3', '1']);
    expect(isNewer({ at: '2026-11-26T10:00:01Z', device: 'a' }, { at: '2026-11-26T10:00:00Z', device: 'z' })).toBe(true);
    expect(isNewer({ at: '2026-11-26T10:00:00Z', device: 'a' }, { at: '2026-11-26T10:00:00Z', device: 'z' })).toBe(false);
    expect(normalizeKeyCode('abcd-efgh ijkl-mnop-qrst-uvwx-yz23-4567-abcd-efgh-ijkl-mnop-qrst')).toHaveLength(52);
    expect(normalizeKeyCode('abcd')).toBe('');
  });

  it('note chaque changement des tables de données, et seulement eux', async () => {
    const { db, raw } = createTestDb();
    for (const table of SYNC_TABLES) {
      const triggers = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND name LIKE 'sync_%'").all(table);
      expect(triggers.map((t) => t.name).sort(), table).toEqual([`sync_${table}_ad`, `sync_${table}_ai`, `sync_${table}_au`]);
    }
    // Toute contrainte d'unicité d'une table synchronisée a sa règle de résolution.
    for (const table of SYNC_TABLES) {
      const unique = (raw.prepare(`PRAGMA index_list(${table})`).all() as { name: string; unique: number; origin: string }[]).filter((i) => i.unique && i.origin !== 'pk');
      for (const index of unique) {
        const columns = (raw.prepare(`PRAGMA index_info(${index.name})`).all() as { name: string }[]).map((c) => c.name);
        expect(UNIQUE_RULES.some((r) => r.table === table && r.columns.join() === columns.join()), `${table} (${columns})`).toBe(true);
      }
    }
    // Les lignes déjà là (types de projet, modules…) partiront au premier envoi.
    const seeded = await db.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM sync_rows WHERE seq > 0');
    expect(seeded!.count).toBeGreaterThan(5);

    await db.batch([task('t1', 'Maquette')]);
    expect(await db.queryOne('SELECT deleted, device FROM sync_rows WHERE tbl = ? AND row_key = ?', ['tasks', '["t1"]'])).toEqual({ deleted: 0, device: null });
    await db.batch([sql`DELETE FROM tasks WHERE id = 't1'`]);
    expect(await db.queryOne('SELECT deleted FROM sync_rows WHERE tbl = ? AND row_key = ?', ['tasks', '["t1"]'])).toEqual({ deleted: 1 });
    // Réglages et journal des notifications ne sont pas synchronisés.
    await db.batch([sql`INSERT INTO settings (key, value) VALUES ('theme', '"dark"')`]);
    expect(await db.queryOne("SELECT COUNT(*) AS count FROM sync_rows WHERE tbl = 'settings'")).toEqual({ count: 0 });
  });
});

describe('synchronisation : deux appareils', () => {
  it('fait passer créations, modifications et suppressions d’un appareil à l’autre', async () => {
    const drive = fakeDrive();
    const a = createTestDb().db;
    const b = createTestDb().db;
    await a.batch([task('t1', 'Maquette'), task('t2', 'Relancer le client'), page('p1', 'Notes', '{"type":"doc"}')]);
    await syncOnce(a, drive.transport, NOW);
    const result = await syncOnce(b, drive.transport, NOW);
    expect(result.pulled).toBeGreaterThanOrEqual(3);
    expect(await titles(b, 'tasks')).toEqual(['Maquette', 'Relancer le client']);
    // Ce que B a reçu ne repart pas : seules ses propres lignes de départ sont envoyées.
    expect(await b.queryOne('SELECT device, seq FROM sync_rows WHERE row_key = ?', ['["t1"]'])).toEqual({ device: await ensureDeviceId(a), seq: 0 });

    await b.batch([sql`UPDATE tasks SET title = 'Maquette v2' WHERE id = 't1'`, sql`DELETE FROM tasks WHERE id = 't2'`]);
    await syncOnce(b, drive.transport, NOW);
    await syncOnce(a, drive.transport, NOW);
    expect(await titles(a, 'tasks')).toEqual(['Maquette v2']);
    // Rien de nouveau : une nouvelle synchronisation n'écrit aucun fichier.
    const count = drive.files.length;
    await syncOnce(a, drive.transport, NOW);
    await syncOnce(b, drive.transport, NOW);
    expect(drive.files.length).toBe(count);
  });

  it('garde la modification la plus récente, et l’autre version d’une page', async () => {
    const drive = fakeDrive();
    const a = createTestDb().db;
    const b = createTestDb().db;
    await a.batch([task('t1', 'Maquette'), page('p1', 'Notes', '{"v":"a0"}')]);
    await syncOnce(a, drive.transport, NOW);
    await syncOnce(b, drive.transport, NOW);

    // Les deux modifient la même tâche et la même page sans se synchroniser ; B le fait plus tard.
    await a.batch([sql`UPDATE tasks SET title = 'Version A' WHERE id = 't1'`, sql`UPDATE pages SET content = '{"v":"a1"}' WHERE id = 'p1'`]);
    await stamp(a, 'tasks', 't1', '2026-11-26T11:00:00.000Z');
    await stamp(a, 'pages', 'p1', '2026-11-26T11:00:00.000Z');
    await b.batch([sql`UPDATE tasks SET title = 'Version B' WHERE id = 't1'`, sql`UPDATE pages SET content = '{"v":"b1"}' WHERE id = 'p1'`]);
    await stamp(b, 'tasks', 't1', '2026-11-26T11:05:00.000Z');
    await stamp(b, 'pages', 'p1', '2026-11-26T11:05:00.000Z');

    await syncOnce(a, drive.transport, NOW);
    await syncOnce(b, drive.transport, NOW);
    await syncOnce(a, drive.transport, NOW);
    for (const db of [a, b]) {
      expect(await titles(db, 'tasks')).toEqual(['Version B']);
      const pages = await db.query<{ title: string; content: string }>('SELECT title, content FROM pages WHERE is_template = 0 ORDER BY title');
      // B gagne ; la version de A est gardée en copie, sur les deux appareils.
      expect(pages).toEqual([
        { title: 'Notes', content: '{"v":"b1"}' },
        { title: 'Notes (autre version)', content: '{"v":"a1"}' },
      ]);
    }
  });

  it('résout les doublons sur une contrainte d’unicité au lieu de bloquer', async () => {
    const drive = fakeDrive();
    const a = createTestDb().db;
    const b = createTestDb().db;
    // Chacun crée le journal du même jour avant toute synchronisation.
    await a.batch([page('ja', 'Journal A', '{}', '2026-11-26')]);
    await b.batch([page('jb', 'Journal B', '{}', '2026-11-26')]);
    await syncOnce(a, drive.transport, NOW);
    await syncOnce(b, drive.transport, NOW);
    await syncOnce(a, drive.transport, NOW);
    for (const db of [a, b]) {
      expect(await db.query('SELECT id, journal_date FROM pages WHERE is_template = 0 ORDER BY id')).toEqual([
        { id: 'ja', journalDate: '2026-11-26' },
        { id: 'jb', journalDate: null },
      ]);
    }
  });

  it('découpe les gros envois, s’arrête devant une version plus récente, et repart à neuf en rejoignant', async () => {
    const drive = fakeDrive();
    const a = createTestDb().db;
    const big = 'x'.repeat(Math.ceil(MAX_FILE_BYTES / 2.5));
    await a.batch(
      ['i1', 'i2', 'i3'].map((id) => sql`INSERT INTO attachments (id, page_id, data, mime, created_at) VALUES (${id}, NULL, ${big}, 'image/png', ${NOW})`),
    ).catch(async () => {
      // Le schéma exact des pièces jointes : on le relit plutôt que de le supposer.
      const columns = await a.query<{ name: string; notnull: number }>('PRAGMA table_info(attachments)');
      throw new Error(`attachments : ${columns.map((c) => c.name).join(', ')}`);
    });
    const sent = await pushChanges(a, drive.transport, NOW);
    expect(sent).toBeGreaterThan(3);
    expect(drive.files.length).toBeGreaterThanOrEqual(2);

    const b = createTestDb().db;
    drive.files.push({ id: 'futur', name: changeFileName('zz-futur', 1), text: JSON.stringify({ format: 1, schema: 999, device: 'zz-futur', seq: 1, createdAt: NOW, rows: [] }) });
    await expect(pullChanges(b, drive.transport, NOW)).rejects.toThrow(/version plus récente/);

    const device = await ensureDeviceId(a);
    await a.batch(resetDeviceStatements());
    expect(await ensureDeviceId(a)).not.toBe(device);
    expect(await getSyncState(a, 'pushed')).toBeNull();
  });
});
