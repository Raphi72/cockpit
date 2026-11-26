import type { Db, Statement } from '@/core/db';
import { getSetting } from '@/domains/settings/repository';
import { looksLikeTimetable, parseCourseTitle, SCHOOL_MANUAL_SETTING, syncWindow, toLocalEvent, type RemoteCalendar, type RemoteEvent } from './model';
import {
  autoSubjectStatements,
  followCourseDatesStatement,
  listGoogleCalendars,
  replaceEventsStatements,
  setCalendarSchoolStatement,
  syncCalendarsStatements,
} from './repository';

/** Ce que la relecture demande au natif (remplaçable dans les tests). */
export type GoogleSource = {
  calendars: () => Promise<RemoteCalendar[]>;
  events: (calendarId: string, timeMin: string, timeMax: string, timeZone: string) => Promise<RemoteEvent[]>;
};

/**
 * Relit Google Agenda : la liste des agendas, puis les événements de ceux qui sont affichés, sur la
 * fenêtre de syncWindow. Chaque agenda est remplacé d'un coup (une transaction) : en cas d'erreur réseau,
 * la copie d'avant reste.
 *
 * L'agenda des cours se reconnaît seul (looksLikeTimetable) tant qu'aucun agenda n'en est un et que
 * l'utilisateur n'a pas choisi lui-même dans Paramètres. Ses événements à l'heure gardent leur cours, son
 * type et ses profs ; les intitulés nouveaux reçoivent leur matière (créée au besoin), et les devoirs
 * reliés à un cours qui a changé de jour le suivent. Renvoie le nombre d'événements copiés.
 */
export async function syncGoogle(db: Db, source: GoogleSource, today: string, timeZone: string, now: string): Promise<number> {
  const remote = await source.calendars();
  await db.batch(syncCalendarsStatements(remote, await listGoogleCalendars(db), now));
  const window = syncWindow(today);
  const shown = (await listGoogleCalendars(db)).filter((c) => c.shown);
  const detect = !shown.some((c) => c.isSchool) && (await getSetting<boolean>(db, SCHOOL_MANUAL_SETTING)) === null;
  let count = 0;
  for (const calendar of shown) {
    const local = (await source.events(calendar.id, window.timeMin, window.timeMax, timeZone)).map(toLocalEvent);
    const detected = !calendar.isSchool && detect && looksLikeTimetable(local);
    const school = calendar.isSchool || detected;
    const events = local.map((event) => {
      if (!school || event.allDay) return event;
      const parts = parseCourseTitle(event.title);
      return { ...event, course: parts.name, courseKind: parts.kind, teacher: parts.teacher };
    });
    const statements: Statement[] = detected ? [setCalendarSchoolStatement(calendar.id, true, now)] : [];
    await db.batch([...statements, ...replaceEventsStatements(calendar.id, events, now)]);
    count += events.length;
  }
  const subjects = await autoSubjectStatements(db, now);
  await db.batch([...subjects.statements, followCourseDatesStatement(now)]);
  return count;
}
