import type { Db, Statement } from '@/core/db';
import { newId } from '@/core/ids';
import { freeSubjectColor, nearestPaletteKey, planCalendars, sameName, type GoogleCalendar, type LocalEvent, type RemoteCalendar } from './model';

type CalendarRow = Omit<GoogleCalendar, 'isPrimary' | 'shown' | 'isSchool'> & { isPrimary: number; shown: number; isSchool: number };

/** Les agendas gardés en local : le principal d'abord, puis par ordre d'arrivée. */
export async function listGoogleCalendars(db: Db): Promise<GoogleCalendar[]> {
  const rows = await db.query<CalendarRow>(
    `SELECT id, name, google_color, color, is_primary, shown, is_school, synced_at FROM google_calendars
     ORDER BY is_primary DESC, sort_order`,
  );
  return rows.map((row) => ({ ...row, isPrimary: row.isPrimary === 1, shown: row.shown === 1, isSchool: row.isSchool === 1 }));
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

/** Remplace d'un coup les événements copiés d'un agenda (avec leur intitulé de cours pour l'agenda des cours). */
export function replaceEventsStatements(calendarId: string, events: LocalEvent[], now: string): Statement[] {
  return [
    { sql: 'DELETE FROM google_events WHERE calendar_id = ?', params: [calendarId] },
    ...events.map(
      (e): Statement => ({
        sql: `INSERT OR REPLACE INTO google_events (calendar_id, id, title, location, starts_at, ends_at, all_day, html_link, course)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [calendarId, e.id, e.title, e.location, e.startsAt, e.endsAt, e.allDay ? 1 : 0, e.htmlLink, e.course ?? null],
      }),
    ),
    { sql: 'UPDATE google_calendars SET synced_at = ? WHERE id = ?', params: [now, calendarId] },
  ];
}

export function setCalendarShownStatement(id: string, shown: boolean, now: string): Statement {
  return { sql: 'UPDATE google_calendars SET shown = ?, updated_at = ? WHERE id = ?', params: [shown ? 1 : 0, now, id] };
}

export function setCalendarColorStatement(id: string, color: string, now: string): Statement {
  return { sql: 'UPDATE google_calendars SET color = ?, updated_at = ? WHERE id = ?', params: [color, now, id] };
}

/** L'agenda des cours (ou plus) : ses événements deviennent des cours à la prochaine relecture. */
export function setCalendarSchoolStatement(id: string, school: boolean, now: string): Statement {
  return { sql: 'UPDATE google_calendars SET is_school = ?, updated_at = ? WHERE id = ?', params: [school ? 1 : 0, now, id] };
}

/** Un agenda masqué ne garde pas ses événements : ils reviendront à la prochaine relecture s'il est réaffiché. */
export function clearCalendarEventsStatement(id: string): Statement {
  return { sql: 'DELETE FROM google_events WHERE calendar_id = ?', params: [id] };
}

/** Déconnexion : toute la copie locale part (les événements avec leurs agendas). Les liens des cours restent. */
export function clearGoogleStatement(): Statement {
  return { sql: 'DELETE FROM google_calendars', params: [] };
}

// ─── Cours ──────────────────────────────────────────────────────────────────

/** Relie un intitulé de cours à une matière ; `null` : ce n'est pas un cours (ignoré, jamais recréé). */
export function setCourseLinkStatement(course: string, subjectId: string | null, now: string): Statement {
  return {
    sql: `INSERT INTO course_links (course, subject_id, created_at, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (course) DO UPDATE SET subject_id = excluded.subject_id, updated_at = excluded.updated_at`,
    params: [course, subjectId, now, now],
  };
}

/**
 * Les matières créées toutes seules : chaque intitulé de l'agenda des cours pas encore relié l'est à la
 * matière de même nom (sans accents ni majuscules), sinon à une nouvelle matière, d'une couleur libre.
 */
export async function autoSubjectStatements(db: Db, now: string): Promise<{ statements: Statement[]; created: number }> {
  const courses = await db.query<{ course: string }>(
    `SELECT DISTINCT g.course FROM google_events g
     JOIN google_calendars c ON c.id = g.calendar_id
     WHERE c.is_school = 1 AND g.course IS NOT NULL AND g.course NOT IN (SELECT course FROM course_links)
     ORDER BY g.course`,
  );
  if (courses.length === 0) return { statements: [], created: 0 };
  const subjects = await db.query<{ id: string; name: string; color: string }>('SELECT id, name, color FROM subjects');
  const used = subjects.map((s) => s.color);
  const statements: Statement[] = [];
  let created = 0;
  for (const { course } of courses) {
    const existing = subjects.find((s) => sameName(s.name, course));
    let subjectId = existing?.id;
    if (!subjectId) {
      subjectId = newId();
      const color = freeSubjectColor(used);
      used.push(color);
      subjects.push({ id: subjectId, name: course, color });
      statements.push({
        sql: `INSERT INTO subjects (id, name, color, teacher, room, coefficient, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, NULL, NULL, 1, COALESCE((SELECT MAX(sort_order) FROM subjects), 0) + 1, ?, ?)`,
        params: [subjectId, course, color, now, now],
      });
      created += 1;
    }
    statements.push(setCourseLinkStatement(course, subjectId, now));
  }
  return { statements, created };
}

export type CourseOnDay = {
  itemId: string;
  title: string;
  course: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string | null;
};

/** Les cours d'un jour venant de l'agenda des cours (affiché), sauf les intitulés ignorés. */
export function listCoursesOn(db: Db, day: string): Promise<CourseOnDay[]> {
  return db.query<CourseOnDay>(
    `SELECT g.calendar_id || '|' || g.id AS item_id, g.title, g.course, g.starts_at, g.ends_at, g.location,
            cl.subject_id, s.name AS subject_name, s.color AS subject_color
     FROM google_events g
     JOIN google_calendars c ON c.id = g.calendar_id
     LEFT JOIN course_links cl ON cl.course = g.course
     LEFT JOIN subjects s ON s.id = cl.subject_id
     WHERE c.is_school = 1 AND c.shown = 1 AND g.all_day = 0 AND substr(g.starts_at, 1, 10) = ?
       AND NOT (cl.course IS NOT NULL AND cl.subject_id IS NULL)
     ORDER BY g.starts_at`,
    [day],
  );
}

/** Le jour du prochain cours d'une matière après `after` (pour rendre un devoir au cours suivant). */
export async function nextCourseDay(db: Db, subjectId: string, after: string): Promise<string | null> {
  const row = await db.queryOne<{ day: string | null }>(
    `SELECT MIN(substr(g.starts_at, 1, 10)) AS day FROM google_events g
     JOIN google_calendars c ON c.id = g.calendar_id
     JOIN course_links cl ON cl.course = g.course
     WHERE c.is_school = 1 AND cl.subject_id = ? AND substr(g.starts_at, 1, 10) > ?`,
    [subjectId, after],
  );
  return row?.day ?? null;
}

export type GoogleEventDetail = LocalEvent & {
  calendarName: string;
  color: string;
  isSchool: boolean;
  /** Pour un cours : sa matière (ou `null` si l'intitulé est ignoré ou pas encore relié). */
  subjectId: string | null;
  subjectName: string | null;
  /** Vrai si l'intitulé a été marqué « pas un cours ». */
  ignored: boolean;
};

/** Un événement copié, son agenda et, pour un cours, sa matière (fenêtre de détail). */
export function getGoogleEvent(db: Db, calendarId: string, eventId: string): Promise<GoogleEventDetail | undefined> {
  type Row = Omit<GoogleEventDetail, 'allDay' | 'isSchool' | 'ignored'> & { allDay: number; isSchool: number; linked: number };
  return db
    .queryOne<Row>(
      `SELECT g.id, g.title, g.location, g.starts_at, g.ends_at, g.all_day, g.html_link, g.course,
              c.name AS calendar_name, COALESCE(s.color, c.color) AS color, c.is_school,
              cl.subject_id, s.name AS subject_name, cl.course IS NOT NULL AS linked
       FROM google_events g
       JOIN google_calendars c ON c.id = g.calendar_id
       LEFT JOIN course_links cl ON c.is_school = 1 AND cl.course = g.course
       LEFT JOIN subjects s ON s.id = cl.subject_id
       WHERE g.calendar_id = ? AND g.id = ?`,
      [calendarId, eventId],
    )
    .then(
      (row) =>
        row && {
          ...row,
          allDay: row.allDay === 1,
          isSchool: row.isSchool === 1,
          ignored: row.isSchool === 1 && row.linked === 1 && row.subjectId === null,
        },
    );
}

/** Les devoirs d'une matière à rendre un jour donné (ce qui est attendu pour ce cours). */
export function homeworkDueOn(db: Db, subjectId: string, day: string): Promise<{ id: string; title: string; status: string }[]> {
  return db.query(
    `SELECT id, title, status FROM tasks WHERE subject_id = ? AND due_date = ? AND parent_id IS NULL ORDER BY status = 'done', sort_order`,
    [subjectId, day],
  );
}

