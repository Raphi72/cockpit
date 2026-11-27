import type { Db, Statement } from '@/core/db';
import { reinsertRowStatement } from '@/core/db/rows';
import { newId } from '@/core/ids';
import {
  googleEventId,
  insertPayload,
  parseWriteError,
  patchPayload,
  seriesRetime,
  type EditStatus,
  type EventContent,
  type GoogleEdit,
  type WriteFailure,
} from './model';
import {
  applyEditStatements,
  deleteEditStatement,
  editedRows,
  insertEditStatement,
  listEdits,
  setEditStatusStatement,
} from './repository';

/** Ce que l'envoi demande au natif (remplaçable dans les tests). */
export type GoogleWriter = {
  insert: (calendarId: string, event: Record<string, unknown>) => Promise<void>;
  patch: (calendarId: string, eventId: string, patch: Record<string, unknown>) => Promise<void>;
  remove: (calendarId: string, eventId: string) => Promise<void>;
  retime: (calendarId: string, seriesId: string, startTime: string, endTime: string, timeZone: string) => Promise<void>;
};

/** Les lignes de la copie avant une modification : de quoi la défaire. */
export type EditUndo = { edit: GoogleEdit; before: Record<string, unknown>[] };

/** Note une modification et l'applique à la copie locale, dans un même lot. */
export async function recordEdit(db: Db, edit: GoogleEdit, now: string): Promise<EditUndo> {
  const before = edit.op === 'insert' ? [] : await editedRows(db, edit);
  await db.batch([insertEditStatement(edit, now), ...applyEditStatements(edit)]);
  return { edit, before };
}

/** La copie remise comme avant une modification : ce qu'elle a touché est retiré, puis les lignes d'avant reviennent. */
function restoreStatements(edit: GoogleEdit, before: Record<string, unknown>[]): Statement[] {
  const series = edit.scope === 'all' && edit.seriesId;
  return [
    {
      sql: `DELETE FROM google_events WHERE calendar_id = ? AND ${series ? '(id = ? OR series_id = ?)' : 'id = ?'}`,
      params: series ? [edit.calendarId, edit.seriesId, edit.seriesId] : [edit.calendarId, edit.eventId],
    },
    ...before.map((row) => reinsertRowStatement('google_events', row)),
  ];
}

const contentOf = (row: Record<string, unknown>): EventContent => ({
  title: String(row.title ?? ''),
  location: (row.location as string | null) ?? null,
  notes: (row.notes as string | null) ?? null,
  startsAt: String(row.startsAt),
  endsAt: (row.endsAt as string | null) ?? null,
  allDay: row.allDay === 1,
  projectId: (row.projectId as string | null) ?? null,
  subjectId: (row.subjectId as string | null) ?? null,
});

/**
 * « Annuler » : une modification pas encore envoyée (ou une retouche locale) disparaît et la copie revient ;
 * déjà chez Google, une modification inverse la défait (un événement supprimé est recréé à l'identique).
 */
export async function undoEdit(db: Db, { edit, before }: EditUndo, now: string): Promise<void> {
  const current = await db.queryOne<{ status: EditStatus }>('SELECT status FROM google_edits WHERE id = ?', [edit.id]);
  if (current && current.status !== 'done') {
    await db.batch([deleteEditStatement(edit.id), ...restoreStatements(edit, before)]);
    return;
  }
  // L'original est parti chez Google : l'inverse y part aussi.
  const base = { calendarId: edit.calendarId, seriesId: null, scope: 'this' as const, status: 'pending' as const, error: null, createdAt: now };
  const first = before[0];
  let reverse: GoogleEdit;
  if (edit.op === 'insert') {
    reverse = { ...base, id: newId(), eventId: edit.eventId, op: 'delete', fields: [] };
  } else if (!first) {
    return;
  } else if (edit.op === 'delete') {
    // Recréé à l'identique (une occurrence seule ; une série entière revient par Google Agenda).
    const id = newId();
    reverse = { ...base, ...contentOf(first), id, eventId: googleEventId(id), op: 'insert', fields: [] };
  } else {
    reverse = { ...base, ...contentOf(first), id: newId(), eventId: edit.eventId, seriesId: edit.seriesId, scope: edit.scope, op: 'patch', fields: edit.fields };
  }
  await recordEdit(db, reverse, now);
}

/** Les modifications ré-appliquées à la copie (après une relecture, ou celles reçues de l'autre appareil). */
export async function reapplyEdits(db: Db, calendarId?: string): Promise<void> {
  const edits = await listEdits(db, { statuses: ['pending', 'local', 'done'], calendarId });
  if (edits.length > 0) await db.batch(edits.flatMap(applyEditStatements));
}

async function send(writer: GoogleWriter, edit: GoogleEdit, timeZone: string): Promise<void> {
  const target = edit.scope === 'all' && edit.seriesId ? edit.seriesId : edit.eventId;
  if (edit.op === 'insert') return writer.insert(edit.calendarId, insertPayload(edit as GoogleEdit & EventContent, timeZone));
  if (edit.op === 'delete') return writer.remove(edit.calendarId, target);
  const body = patchPayload(edit, timeZone);
  if (Object.keys(body).length > 0) await writer.patch(edit.calendarId, target, body);
  const retime = seriesRetime(edit);
  if (retime && edit.seriesId) await writer.retime(edit.calendarId, edit.seriesId, retime.startTime, retime.endTime, timeZone);
}

/**
 * Envoie chez Google les modifications en attente, dans l'ordre. Hors ligne ou sans le droit d'écrire
 * (téléphone pas encore relié à nouveau, connexion à refaire), on s'arrête : elles partiront plus tard, de
 * cet appareil ou de l'autre. Une modification que Google refuse reste une retouche dans Cockpit, avec la
 * raison. Renvoie le nombre d'envois réussis et ce qui a arrêté l'envoi.
 */
export async function pushEdits(db: Db, writer: GoogleWriter, timeZone: string, now: string): Promise<{ pushed: number; blocked: WriteFailure | null }> {
  const edits = await listEdits(db, { statuses: ['pending'] });
  let pushed = 0;
  for (const edit of edits) {
    try {
      await send(writer, edit, timeZone);
      await db.batch([setEditStatusStatement(edit.id, 'done', null, now)]);
      pushed += 1;
    } catch (error) {
      const failure = parseWriteError(error);
      if (failure.kind !== 'error') return { pushed, blocked: failure };
      await db.batch([setEditStatusStatement(edit.id, 'local', failure.message, now)]);
    }
  }
  return { pushed, blocked: null };
}
