import type { Db, Statement } from '@/core/db';
import type { PaletteKey } from '@/ui/data/ColorDot';
import { nearestPaletteKey, planCalendars, type GoogleCalendar, type LocalEvent, type RemoteCalendar } from './model';

type CalendarRow = Omit<GoogleCalendar, 'isPrimary' | 'shown'> & { isPrimary: number; shown: number };

/** Les agendas gardés en local : le principal d'abord, puis par ordre d'arrivée. */
export async function listGoogleCalendars(db: Db): Promise<GoogleCalendar[]> {
  const rows = await db.query<CalendarRow>(
    `SELECT id, name, google_color, color, is_primary, shown, synced_at FROM google_calendars
     ORDER BY is_primary DESC, sort_order`,
  );
  return rows.map((row) => ({ ...row, isPrimary: row.isPrimary === 1, shown: row.shown === 1 }));
}

/**
 * Met la liste locale à jour d'après Google : un agenda nouveau prend la couleur de la palette la plus
 * proche et n'est affiché que s'il est coché dans Google ; un agenda connu garde les choix faits dans
 * Cockpit ; un agenda disparu part avec ses événements.
 */
export function syncCalendarsStatements(remote: RemoteCalendar[], local: Pick<GoogleCalendar, 'id'>[], now: string): Statement[] {
  const plan = planCalendars(remote, local);
  return [
    ...plan.added.map(
      (c): Statement => ({
        sql: `INSERT INTO google_calendars (id, name, google_color, color, is_primary, shown, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM google_calendars), 0) + 1, ?, ?)`,
        params: [c.id, c.name, c.color, nearestPaletteKey(c.color), c.primary ? 1 : 0, c.selected || c.primary ? 1 : 0, now, now],
      }),
    ),
    ...plan.kept.map(
      (c): Statement => ({
        sql: 'UPDATE google_calendars SET name = ?, google_color = ?, is_primary = ?, updated_at = ? WHERE id = ?',
        params: [c.name, c.color, c.primary ? 1 : 0, now, c.id],
      }),
    ),
    ...plan.removed.map((id): Statement => ({ sql: 'DELETE FROM google_calendars WHERE id = ?', params: [id] })),
  ];
}

/** Remplace d'un coup les événements copiés d'un agenda. */
export function replaceEventsStatements(calendarId: string, events: LocalEvent[], now: string): Statement[] {
  return [
    { sql: 'DELETE FROM google_events WHERE calendar_id = ?', params: [calendarId] },
    ...events.map(
      (e): Statement => ({
        sql: `INSERT OR REPLACE INTO google_events (calendar_id, id, title, location, starts_at, ends_at, all_day, html_link)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [calendarId, e.id, e.title, e.location, e.startsAt, e.endsAt, e.allDay ? 1 : 0, e.htmlLink],
      }),
    ),
    { sql: 'UPDATE google_calendars SET synced_at = ? WHERE id = ?', params: [now, calendarId] },
  ];
}

export function setCalendarShownStatement(id: string, shown: boolean, now: string): Statement {
  return { sql: 'UPDATE google_calendars SET shown = ?, updated_at = ? WHERE id = ?', params: [shown ? 1 : 0, now, id] };
}

export function setCalendarColorStatement(id: string, color: PaletteKey, now: string): Statement {
  return { sql: 'UPDATE google_calendars SET color = ?, updated_at = ? WHERE id = ?', params: [color, now, id] };
}

/** Un agenda masqué ne garde pas ses événements : ils reviendront à la prochaine relecture s'il est réaffiché. */
export function clearCalendarEventsStatement(id: string): Statement {
  return { sql: 'DELETE FROM google_events WHERE calendar_id = ?', params: [id] };
}

/** Déconnexion : toute la copie locale part (les événements avec leurs agendas). */
export function clearGoogleStatement(): Statement {
  return { sql: 'DELETE FROM google_calendars', params: [] };
}

/** Un événement copié et le nom de son agenda (fenêtre de détail). */
export function getGoogleEvent(
  db: Db,
  calendarId: string,
  eventId: string,
): Promise<(LocalEvent & { calendarName: string; color: PaletteKey }) | undefined> {
  return db
    .queryOne<Omit<LocalEvent, 'allDay'> & { calendarName: string; color: PaletteKey; allDay: number }>(
      `SELECT g.id, g.title, g.location, g.starts_at, g.ends_at, g.all_day, g.html_link, c.name AS calendar_name, c.color
       FROM google_events g JOIN google_calendars c ON c.id = g.calendar_id
       WHERE g.calendar_id = ? AND g.id = ?`,
      [calendarId, eventId],
    )
    .then((row) => row && { ...row, allDay: row.allDay === 1 });
}
