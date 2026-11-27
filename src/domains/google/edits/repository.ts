import type { Db, Statement } from '@/core/db';
import type { EditField, EditStatus, EventContent, GoogleEdit } from './model';

type EditRow = Omit<GoogleEdit, 'fields' | 'allDay'> & { fields: string; allDay: number | null };

const EDIT_COLUMNS = `id, calendar_id, event_id, series_id, op, scope, fields, title, location, notes, starts_at, ends_at, all_day,
  project_id, subject_id, recurrence, status, error, created_at`;

function fromRow(row: EditRow): GoogleEdit {
  return {
    ...row,
    fields: JSON.parse(row.fields) as EditField[],
    allDay: row.allDay === null ? undefined : row.allDay === 1,
    title: row.title ?? undefined,
    startsAt: row.startsAt ?? undefined,
  };
}

/** Les modifications, dans l'ordre où elles ont été faites ; d'un seul agenda si `calendarId`. */
export async function listEdits(db: Db, options: { statuses: EditStatus[]; calendarId?: string }): Promise<GoogleEdit[]> {
  const marks = options.statuses.map(() => '?').join(', ');
  const rows = await db.query<EditRow>(
    `SELECT ${EDIT_COLUMNS} FROM google_edits WHERE status IN (${marks}) ${options.calendarId ? 'AND calendar_id = ?' : ''} ORDER BY created_at, id`,
    options.calendarId ? [...options.statuses, options.calendarId] : options.statuses,
  );
  return rows.map(fromRow);
}

export function insertEditStatement(edit: GoogleEdit, now: string): Statement {
  return {
    sql: `INSERT INTO google_edits (${EDIT_COLUMNS}, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      edit.id,
      edit.calendarId,
      edit.eventId,
      edit.seriesId,
      edit.op,
      edit.scope,
      JSON.stringify(edit.fields),
      edit.title ?? null,
      edit.location ?? null,
      edit.notes ?? null,
      edit.startsAt ?? null,
      edit.endsAt ?? null,
      edit.allDay === undefined ? null : edit.allDay ? 1 : 0,
      edit.projectId ?? null,
      edit.subjectId ?? null,
      edit.recurrence ?? null,
      edit.status,
      edit.error,
      edit.createdAt,
      now,
    ],
  };
}

export function setEditStatusStatement(id: string, status: EditStatus, error: string | null, now: string): Statement {
  return { sql: 'UPDATE google_edits SET status = ?, error = ?, updated_at = ? WHERE id = ?', params: [status, error, now, id] };
}

export function deleteEditStatement(id: string): Statement {
  return { sql: 'DELETE FROM google_edits WHERE id = ?', params: [id] };
}

/** Après la relecture d'un agenda : ses modifications envoyées y sont, elles ne servent plus. */
export function deleteDoneEditsStatement(calendarId: string): Statement {
  return { sql: "DELETE FROM google_edits WHERE calendar_id = ? AND status = 'done'", params: [calendarId] };
}

/** Les lignes de la copie que touche une modification (pour « Annuler »). */
export function editedRows(db: Db, edit: Pick<GoogleEdit, 'calendarId' | 'eventId' | 'seriesId' | 'scope'>): Promise<Record<string, unknown>[]> {
  const series = edit.scope === 'all' && edit.seriesId;
  return db.query<Record<string, unknown>>(
    `SELECT * FROM google_events WHERE calendar_id = ? AND ${series ? '(id = ? OR series_id = ?)' : 'id = ?'}`,
    series ? [edit.calendarId, edit.seriesId, edit.seriesId] : [edit.calendarId, edit.eventId],
  );
}

/** Le contenu d'un événement de la copie (pour le modifier). */
export async function getEventContent(db: Db, calendarId: string, eventId: string): Promise<(EventContent & { seriesId: string | null }) | null> {
  const row = await db.queryOne<Omit<EventContent, 'allDay'> & { allDay: number; seriesId: string | null }>(
    `SELECT title, location, notes, starts_at, ends_at, all_day, project_id, subject_id, series_id FROM google_events WHERE calendar_id = ? AND id = ?`,
    [calendarId, eventId],
  );
  return row ? { ...row, allDay: row.allDay === 1 } : null;
}

/**
 * Applique une modification à la copie locale : partout où Cockpit montre les événements Google, elle se
 * voit aussitôt. Une création n'a lieu que si son agenda est copié sur cet appareil.
 */
export function applyEditStatements(edit: GoogleEdit): Statement[] {
  const series = edit.scope === 'all' && edit.seriesId;
  const where = series ? '(id = ? OR series_id = ?)' : 'id = ?';
  const target = series ? [edit.seriesId, edit.seriesId] : [edit.eventId];
  if (edit.op === 'delete') {
    return [{ sql: `DELETE FROM google_events WHERE calendar_id = ? AND ${where}`, params: [edit.calendarId, ...target] }];
  }
  if (edit.op === 'insert') {
    return [
      {
        sql: `INSERT OR REPLACE INTO google_events
                (calendar_id, id, title, location, notes, starts_at, ends_at, all_day, html_link, project_id, subject_id, edited)
              SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1 WHERE EXISTS (SELECT 1 FROM google_calendars WHERE id = ?)`,
        params: [
          edit.calendarId,
          edit.eventId,
          edit.title ?? '(Sans titre)',
          edit.location ?? null,
          edit.notes ?? null,
          edit.startsAt ?? null,
          edit.endsAt ?? null,
          edit.allDay ? 1 : 0,
          edit.projectId ?? null,
          edit.subjectId ?? null,
          edit.calendarId,
        ],
      },
    ];
  }
  const sets: string[] = ['edited = 1'];
  const params: (string | number | null)[] = [];
  if (edit.fields.includes('title')) {
    sets.push('title = ?');
    params.push(edit.title ?? '(Sans titre)');
  }
  if (edit.fields.includes('location')) {
    sets.push('location = ?');
    params.push(edit.location ?? null);
  }
  if (edit.fields.includes('notes')) {
    sets.push('notes = ?');
    params.push(edit.notes ?? null);
  }
  if (edit.fields.includes('link')) {
    sets.push('project_id = ?', 'subject_id = ?');
    params.push(edit.projectId ?? null, edit.subjectId ?? null);
  }
  if (edit.fields.includes('time') && edit.startsAt) {
    if (series && !edit.allDay && edit.startsAt.length > 10) {
      // Toute une série à une autre heure : chaque occurrence garde son jour.
      sets.push("starts_at = substr(starts_at, 1, 11) || ?", "ends_at = CASE WHEN ends_at IS NULL THEN NULL ELSE substr(ends_at, 1, 11) || ? END");
      params.push(edit.startsAt.slice(11, 16), (edit.endsAt ?? edit.startsAt).slice(11, 16));
    } else if (!series) {
      sets.push('starts_at = ?', 'ends_at = ?', 'all_day = ?');
      params.push(edit.startsAt, edit.endsAt ?? null, edit.allDay ? 1 : 0);
    }
  }
  return [{ sql: `UPDATE google_events SET ${sets.join(', ')} WHERE calendar_id = ? AND ${where}`, params: [...params, edit.calendarId, ...target] }];
}
