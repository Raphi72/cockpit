import type { Db } from '@/core/db';
import { syncWindow, toLocalEvent, type RemoteCalendar, type RemoteEvent } from './model';
import { listGoogleCalendars, replaceEventsStatements, syncCalendarsStatements } from './repository';

/** Ce que la relecture demande au natif (remplaçable dans les tests). */
export type GoogleSource = {
  calendars: () => Promise<RemoteCalendar[]>;
  events: (calendarId: string, timeMin: string, timeMax: string, timeZone: string) => Promise<RemoteEvent[]>;
};

/**
 * Relit Google Agenda : la liste des agendas, puis les événements de ceux qui sont affichés, sur la
 * fenêtre de syncWindow. Chaque agenda est remplacé d'un coup (une transaction) : en cas d'erreur réseau,
 * la copie d'avant reste. Renvoie le nombre d'événements copiés.
 */
export async function syncGoogle(db: Db, source: GoogleSource, today: string, timeZone: string, now: string): Promise<number> {
  const remote = await source.calendars();
  await db.batch(syncCalendarsStatements(remote, await listGoogleCalendars(db), now));
  const window = syncWindow(today);
  let count = 0;
  for (const calendar of (await listGoogleCalendars(db)).filter((c) => c.shown)) {
    const events = (await source.events(calendar.id, window.timeMin, window.timeMax, timeZone)).map(toLocalEvent);
    await db.batch(replaceEventsStatements(calendar.id, events, now));
    count += events.length;
  }
  return count;
}
