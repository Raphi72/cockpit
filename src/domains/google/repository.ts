import { addDaysISO } from '@/core/dates';
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
        sql: `INSERT OR REPLACE INTO google_events
                (calendar_id, id, title, location, starts_at, ends_at, all_day, html_link, course, course_kind, teacher)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          calendarId,
          e.id,
          e.title,
          e.location,
          e.startsAt,
          e.endsAt,
          e.allDay ? 1 : 0,
          e.htmlLink,
          e.course ?? null,
          e.courseKind ?? null,
          e.teacher ?? null,
        ],
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

/** Oublie ce qui a été dit d'un intitulé : à la relecture, il redevient un cours avec sa matière. */
export function deleteCourseLinkStatement(course: string): Statement {
  return { sql: 'DELETE FROM course_links WHERE course = ?', params: [course] };
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
  courseKind: string | null;
  teacher: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  subjectId: string | null;
  subjectName: string | null;
  subjectColor: string | null;
  /** Devoirs pas encore faits, à rendre pour ce cours. */
  homeworkOpen: number;
};

/** Les cours de l'agenda des cours (affiché) dont le jour est dans [from, to[, sauf les intitulés ignorés. */
export function listCoursesBetween(db: Db, from: string, to: string): Promise<CourseOnDay[]> {
  return db.query<CourseOnDay>(
    `SELECT g.calendar_id || '|' || g.id AS item_id, g.title, g.course, g.course_kind, g.teacher,
            g.starts_at, g.ends_at, g.location, cl.subject_id, s.name AS subject_name, s.color AS subject_color,
            (SELECT COUNT(*) FROM tasks t
             WHERE t.parent_id IS NULL AND t.status <> 'done'
               AND (t.course_event = g.calendar_id || '|' || g.id
                    OR (t.course_event IS NULL AND t.subject_id = cl.subject_id AND t.due_date = substr(g.starts_at, 1, 10)))
            ) AS homework_open
     FROM google_events g
     JOIN google_calendars c ON c.id = g.calendar_id
     LEFT JOIN course_links cl ON cl.course = g.course
     LEFT JOIN subjects s ON s.id = cl.subject_id
     WHERE c.is_school = 1 AND c.shown = 1 AND g.all_day = 0 AND g.course IS NOT NULL
       AND substr(g.starts_at, 1, 10) >= ? AND substr(g.starts_at, 1, 10) < ?
       AND NOT (cl.course IS NOT NULL AND cl.subject_id IS NULL)
     ORDER BY g.starts_at, g.course`,
    [from, to],
  );
}

/** Les cours d'un jour (voir listCoursesBetween). */
export function listCoursesOn(db: Db, day: string): Promise<CourseOnDay[]> {
  return listCoursesBetween(db, day, addDaysISO(day, 1));
}

/** Y a-t-il un agenda des cours affiché (sinon, l'emploi du temps et les devoirs se passent de Google) ? */
export async function hasSchoolCalendar(db: Db): Promise<boolean> {
  const row = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM google_calendars WHERE is_school = 1 AND shown = 1');
  return (row?.n ?? 0) > 0;
}

/** L'occurrence suivante d'un même cours (même intitulé ramené), après un moment 'YYYY-MM-DDTHH:MM'. */
export function nextCourseOccurrence(db: Db, course: string, after: string): Promise<{ itemId: string; startsAt: string } | undefined> {
  return db.queryOne(
    `SELECT g.calendar_id || '|' || g.id AS item_id, g.starts_at FROM google_events g
     JOIN google_calendars c ON c.id = g.calendar_id
     WHERE c.is_school = 1 AND g.all_day = 0 AND g.course = ? AND g.starts_at > ?
     ORDER BY g.starts_at LIMIT 1`,
    [course, after],
  );
}

/** Un cours copié, pour l'afficher là où un devoir y est relié (fiche du devoir, choix du cours). */
export function getCourse(db: Db, itemId: string): Promise<CourseOnDay | undefined> {
  return db.queryOne<CourseOnDay>(
    `SELECT g.calendar_id || '|' || g.id AS item_id, g.title, g.course, g.course_kind, g.teacher,
            g.starts_at, g.ends_at, g.location, cl.subject_id, s.name AS subject_name, s.color AS subject_color,
            0 AS homework_open
     FROM google_events g
     LEFT JOIN course_links cl ON cl.course = g.course
     LEFT JOIN subjects s ON s.id = cl.subject_id
     WHERE g.calendar_id || '|' || g.id = ?`,
    [itemId],
  );
}

/**
 * Un devoir relié à un cours suit son jour : si le cours a changé de jour dans Google (et qu'il est encore
 * dans la copie locale), le devoir pas encore fait est à rendre ce jour-là.
 */
export function followCourseDatesStatement(now: string): Statement {
  return {
    sql: `UPDATE tasks
          SET due_date = (SELECT substr(g.starts_at, 1, 10) FROM google_events g WHERE g.calendar_id || '|' || g.id = tasks.course_event),
              updated_at = ?
          WHERE course_event IS NOT NULL AND status <> 'done'
            AND EXISTS (SELECT 1 FROM google_events g
                        WHERE g.calendar_id || '|' || g.id = tasks.course_event AND substr(g.starts_at, 1, 10) IS NOT tasks.due_date)`,
    params: [now],
  };
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
      `SELECT g.id, g.title, g.location, g.starts_at, g.ends_at, g.all_day, g.html_link, g.course, g.course_kind, g.teacher,
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

/**
 * Les devoirs à rendre pour un cours : ceux qui y sont reliés, et les anciens (sans cours précis) de la
 * même matière à rendre ce jour-là.
 */
export function homeworkForCourse(
  db: Db,
  itemId: string,
  subjectId: string | null,
  day: string,
): Promise<{ id: string; title: string; status: string }[]> {
  return db.query(
    `SELECT id, title, status FROM tasks
     WHERE parent_id IS NULL
       AND (course_event = ? OR (course_event IS NULL AND subject_id = ? AND due_date = ?))
     ORDER BY status = 'done', sort_order`,
    [itemId, subjectId, day],
  );
}

