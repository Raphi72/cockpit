import type { Db, Statement } from '@/core/db';
import { UserError } from '@/core/db/errors';
import { MAX_FILE_BYTES, SYNC_FORMAT, changeFileName, filesToRead, type ChangeFile, type SyncRow } from './model';
import {
  applyStatements,
  buildSyncRows,
  ensureDeviceId,
  getSyncState,
  listPending,
  readCursors,
  schemaVersion,
  setSyncStateStatement,
} from './repository';

/** Le transport des fichiers : le natif (chiffrement et Google Drive), ou un faux dans les tests. */
export type SyncTransport = {
  list: () => Promise<{ id: string; name: string }[]>;
  download: (id: string) => Promise<string>;
  upload: (name: string, text: string) => Promise<void>;
};

/** Combien de changements lire d'un coup pour les envoyer. */
const PENDING_BATCH = 500;

/**
 * Lit et applique les fichiers des autres appareils pas encore lus, un par un, chacun en une transaction
 * (avec le numéro lu). Un fichier écrit par une version plus récente de Cockpit arrête tout : il faut mettre
 * cet appareil à jour. Renvoie le nombre de lignes appliquées.
 */
export async function pullChanges(db: Db, transport: SyncTransport, now: string): Promise<number> {
  const ownDevice = await ensureDeviceId(db);
  const files = filesToRead(await transport.list(), ownDevice, await readCursors(db));
  const schema = await schemaVersion(db);
  let applied = 0;
  for (const entry of files) {
    const file = JSON.parse(await transport.download(entry.id)) as ChangeFile;
    if (file.format > SYNC_FORMAT || file.schema > schema) {
      throw new UserError('Un autre appareil a une version plus récente de Cockpit : mets à jour celui-ci pour continuer la synchronisation.');
    }
    if (file.device !== entry.device) continue;
    const pushedSeq = Number((await getSyncState(db, 'pushed')) ?? 0);
    const result = await applyStatements(db, file, { ownDevice, pushedSeq, now });
    await db.batch([...result.statements, setSyncStateStatement(`cursor:${entry.device}`, String(entry.seq))]);
    applied += result.applied;
  }
  return applied;
}

/** Envoie les changements locaux pas encore partis, en fichiers de 3 Mo au plus. Renvoie le nombre de lignes envoyées. */
export async function pushChanges(db: Db, transport: SyncTransport, now: string): Promise<number> {
  const device = await ensureDeviceId(db);
  const schema = await schemaVersion(db);
  let pushed = Number((await getSyncState(db, 'pushed')) ?? 0);
  let sent = 0;
  for (;;) {
    const pending = await listPending(db, pushed, PENDING_BATCH);
    if (pending.length === 0) break;
    const rows = await buildSyncRows(db, pending);
    // Découpe en fichiers : un fichier s'arrête avant de dépasser la taille, mais garde au moins une ligne.
    let chunk: SyncRow[] = [];
    let size = 0;
    const flush = async (lastSeq: number) => {
      if (chunk.length === 0) return;
      const file: ChangeFile = { format: SYNC_FORMAT, schema, device, seq: lastSeq, createdAt: now, rows: chunk };
      await transport.upload(changeFileName(device, lastSeq), JSON.stringify(file));
      const statements: Statement[] = [setSyncStateStatement('pushed', String(lastSeq))];
      await db.batch(statements);
      pushed = lastSeq;
      sent += chunk.length;
      chunk = [];
      size = 0;
    };
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const rowSize = JSON.stringify(row).length;
      if (chunk.length > 0 && size + rowSize > MAX_FILE_BYTES) await flush(pending[index - 1]!.seq);
      chunk.push(row);
      size += rowSize;
    }
    await flush(pending[pending.length - 1]!.seq);
  }
  return sent;
}

/** Une synchronisation : d'abord lire les autres (les conflits se tranchent avec le plus récent), puis envoyer. */
export async function syncOnce(db: Db, transport: SyncTransport, now: string): Promise<{ pulled: number; pushed: number }> {
  const pulled = await pullChanges(db, transport, now);
  const pushed = await pushChanges(db, transport, now);
  return { pulled, pushed };
}

/**
 * Cet appareil rejoint une synchronisation (code d'un autre appareil) : un nouvel identifiant, rien de lu,
 * tout à envoyer. Une base restaurée d'un autre appareil ne garde ainsi pas son identifiant.
 */
export function resetDeviceStatements(): Statement[] {
  return [
    { sql: "DELETE FROM sync_state WHERE key IN ('device', 'pushed') OR key LIKE 'cursor:%'", params: [] },
    { sql: 'UPDATE sync_rows SET device = NULL, seq = rowid WHERE device IS NULL', params: [] },
  ];
}
