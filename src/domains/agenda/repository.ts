import { sqlDaysModifier } from '@/core/dates';
import type { Db, SqlValue, Statement } from '@/core/db';
import { EXPECTED_PAYMENT } from '@/domains/finance/payments/repository';
import {
  compareAgendaByDay,
  timingColumns,
  type AgendaEvent,
  type AgendaItem,
  type EventPatch,
  type NewEventInput,
} from './model';
import { listPeriods } from '@/domains/school/periods/repository';
import { classesBetween, slotRoom, slotTitle } from '@/domains/school/timetable/model';
import { listSlots } from '@/domains/school/timetable/repository';
import { expandSeries, formatRecurrence, nextOccurrence, type EventException } from './recurrence';

// ─── Agenda (P8) ────────────────────────────────────────────────────────────

/** Projet dont les tâches restent visibles : ni terminé, ni annulé, ni archivé. */
export const OPEN_PROJECT = `p.status NOT IN ('done', 'cancelled') AND p.archived_at IS NULL`;

/** Projet dont le début et la deadline sont dans l'agenda : ouvert et validé (pas une Proposition). */
export const CONFIRMED_PROJECT = `${OPEN_PROJECT} AND p.status <> 'proposal'`;

type AgendaRow = Omit<AgendaItem, 'key' | 'allDay' | 'occurrence'> & { allDay: number; recurrence: string | null };

// ─── Événements récurrents (P15) ────────────────────────────────────────────

/** Exceptions (occurrences annulées ou déplacées) des événements donnés, rangées par événement. */
export async function listExceptions(db: Db, eventIds: string[]): Promise<Map<string, EventException[]>> {
  const byEvent = new Map<string, EventException[]>();
  if (eventIds.length === 0) return byEvent;
  const rows = await db.query<EventException>(
    `SELECT event_id, occurrence, kind, starts_at, ends_at FROM event_exceptions
     WHERE event_id IN (${eventIds.map(() => '?').join(', ')})
     ORDER BY occurrence`,
    eventIds,
  );
  for (const row of rows) byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row]);
  return byEvent;
}

export function getException(db: Db, eventId: string, occurrence: string): Promise<EventException | undefined> {
  return db.queryOne<EventException>(
    'SELECT event_id, occurrence, kind, starts_at, ends_at FROM event_exceptions WHERE event_id = ? AND occurrence = ?',
    [eventId, occurrence],
  );
}

/** Pose l'exception d'une occurrence (annulée ou déplacée), ou remplace celle qu'elle avait déjà. */
export function upsertExceptionStatement(id: string, exception: EventException, now: string): Statement {
  return {
    sql: `INSERT INTO event_exceptions (id, event_id, occurrence, kind, starts_at, ends_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (event_id, occurrence) DO UPDATE
          SET kind = excluded.kind, starts_at = excluded.starts_at, ends_at = excluded.ends_at`,
    params: [id, exception.eventId, exception.occurrence, exception.kind, exception.startsAt, exception.endsAt, now],
  };
}

/** L'occurrence suit de nouveau la règle. */
export function deleteExceptionStatement(eventId: string, occurrence: string): Statement {
  return { sql: 'DELETE FROM event_exceptions WHERE event_id = ? AND occurrence = ?', params: [eventId, occurrence] };
}

/** Premier jour d'une tâche dans l'agenda : son début s'il précède la deadline, sinon la deadline (ou le début seul). */
const TASK_FIRST_DAY = `CASE WHEN t.scheduled_date < t.due_date THEN t.scheduled_date ELSE COALESCE(t.due_date, t.scheduled_date) END`;

/**
 * Toutes les dates de la plage [from, to[ en un seul aller-retour : les événements saisis, et
 * les dates qui vivent déjà dans leurs tables (débuts et deadlines de projets, tâches, échéances
 * d'encaissement). Rien n'est recopié : décaler une deadline la déplace partout.
 *
 * Les tâches terminées, les encaissements reçus et les projets clos n'y figurent pas, ni les
 * Propositions (devis pas encore signé) : ni leurs dates, ni leurs encaissements. Leurs tâches restent.
 * Une tâche n'apparaît qu'une fois : du début à la deadline si elle a les deux (une barre dans le
 * calendrier), sinon à sa deadline, sinon (si elle est prioritaire) à son début. Avec `plainTasks`
 * (option du calendrier, désactivée par défaut), les tâches ordinaires qui n'ont qu'un début y sont aussi.
 */
export async function listAgenda(
  db: Db,
  from: string,
  to: string,
  options: { plainTasks?: boolean } = {},
): Promise<AgendaItem[]> {
  const rows = await db.query<AgendaRow>(
    `SELECT 'event' AS source, e.id, e.kind, e.title, e.location AS detail,
            e.starts_at AS "start", e.ends_at AS "end", e.all_day, e.project_id, COALESCE(p.color, pt.color) AS color, NULL AS amount_cents,
            e.recurrence, NULL AS subject_id
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     -- 'YYYY-MM-DDTHH:MM' se trie après 'YYYY-MM-DD' : les comparaisons de texte suffisent.
     -- Un événement qui se répète est pris dès qu'il a commencé : ses occurrences sont calculées ensuite.
     WHERE e.starts_at < ? AND (e.recurrence IS NOT NULL OR COALESCE(e.ends_at, e.starts_at) >= ?)

     UNION ALL
     SELECT 'project', p.id, 'project_start', p.name, NULL, p.start_date, NULL, 1, p.id, COALESCE(p.color, pt.color) AS color, NULL, NULL, NULL
     FROM projects p
     JOIN project_types pt ON pt.id = p.type_id
     WHERE p.start_date >= ? AND p.start_date < ? AND ${CONFIRMED_PROJECT}

     UNION ALL
     SELECT 'project', p.id, 'project_deadline', p.name, NULL, p.deadline, NULL, 1, p.id, COALESCE(p.color, pt.color) AS color, NULL, NULL, NULL
     FROM projects p
     JOIN project_types pt ON pt.id = p.type_id
     WHERE p.deadline >= ? AND p.deadline < ? AND ${CONFIRMED_PROJECT}

     UNION ALL
     SELECT 'task', t.id, CASE WHEN t.due_date IS NULL THEN 'task_scheduled' ELSE 'task_due' END,
            t.title, COALESCE(p.name, s.name), ${TASK_FIRST_DAY}, CASE WHEN t.scheduled_date < t.due_date THEN t.due_date END,
            1, t.project_id, COALESCE(p.color, pt.color, s.color), NULL, NULL, t.subject_id
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     LEFT JOIN subjects s ON s.id = t.subject_id
     WHERE t.status <> 'done' AND (p.id IS NULL OR (${OPEN_PROJECT}))
       AND (t.due_date IS NOT NULL OR t.priority >= 2 OR ?)
       AND ${TASK_FIRST_DAY} < ? AND COALESCE(t.due_date, t.scheduled_date) >= ?

     UNION ALL
     SELECT 'payment', pay.id, 'payment_due', COALESCE(p.name, c.name, pay.label),
            CASE WHEN COALESCE(p.name, c.name) IS NULL THEN NULL ELSE pay.label END,
            pay.due_date, NULL, 1, pay.project_id, COALESCE(p.color, pt.color) AS color, pay.amount_cents, NULL, NULL
     FROM payments pay
     LEFT JOIN projects p ON p.id = pay.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     LEFT JOIN clients c ON c.id = pay.client_id
     WHERE ${EXPECTED_PAYMENT} AND pay.due_date >= ? AND pay.due_date < ?

     UNION ALL
     -- Un examen : à son heure s'il en a une, sinon sur la journée.
     SELECT 'exam', x.id, 'exam', x.title, s.name,
            CASE WHEN x.starts_at IS NULL THEN x.date ELSE x.date || 'T' || x.starts_at END,
            CASE WHEN x.ends_at IS NULL THEN NULL ELSE x.date || 'T' || x.ends_at END,
            x.starts_at IS NULL, NULL, s.color, NULL, NULL, x.subject_id
     FROM exams x
     JOIN subjects s ON s.id = x.subject_id
     WHERE x.date >= ? AND x.date < ?

     UNION ALL
     -- Un bloc de la journée (organisateur) ; minuit s'écrit 24:00 dans le bloc, 23:59 ici.
     SELECT 'block', b.id, 'block', b.title, NULL, b.date || 'T' || b.starts_at,
            b.date || 'T' || CASE WHEN b.ends_at = '24:00' THEN '23:59' ELSE b.ends_at END,
            0, NULL, b.color, NULL, NULL, NULL
     FROM day_blocks b
     WHERE b.date >= ? AND b.date < ?

     UNION ALL
     -- Un événement Google Agenda (copie locale, lecture seule) d'un agenda affiché. Dans l'agenda des cours,
     -- un intitulé relié à une matière en fait un cours, à la couleur de la matière, sous son nom propre
     -- (« Machine Learning », « Comptabilité · Examen ») plutôt que l'intitulé brut « Matière | Type | Prof » ;
     -- ce nom est celui de la matière, qui se renomme dans la page Matières.
     SELECT 'google', g.calendar_id || '|' || g.id, CASE WHEN cl.subject_id IS NOT NULL THEN 'class' ELSE 'google' END,
            CASE WHEN cl.subject_id IS NULL THEN g.title
                 WHEN g.course_kind IS NOT NULL AND lower(g.course_kind) <> 'cours' THEN COALESCE(s.name, g.course) || ' · ' || g.course_kind
                 ELSE COALESCE(s.name, g.course) END,
            g.location, g.starts_at, g.ends_at, g.all_day, NULL, COALESCE(s.color, c.color), NULL, NULL, cl.subject_id
     FROM google_events g
     JOIN google_calendars c ON c.id = g.calendar_id
     LEFT JOIN course_links cl ON c.is_school = 1 AND cl.course = g.course
     LEFT JOIN subjects s ON s.id = cl.subject_id
     WHERE c.shown = 1 AND g.starts_at < ? AND COALESCE(g.ends_at, g.starts_at) >= ?`,
    [to, from, from, to, from, to, options.plainTasks ? 1 : 0, to, from, from, to, from, to, from, to, to, from],
  );
  const recurring = rows.filter((row) => row.recurrence !== null);
  const [exceptions, classes] = await Promise.all([
    listExceptions(db, recurring.map((row) => row.id)),
    listClassItems(db, from, to),
  ]);
  return rows
    .flatMap(({ allDay, recurrence, ...row }): AgendaItem[] => {
      const item = { ...row, key: `${row.source}:${row.id}:${row.kind}`, allDay: allDay === 1 };
      if (recurrence === null) return [item];
      // Une ligne par occurrence, à son moment ; le jour prévu par la règle la distingue des autres.
      const series = { startsAt: row.start, endsAt: row.end, recurrence };
      return expandSeries(series, exceptions.get(row.id) ?? [], from, to).map((occurrence) => ({
        ...item,
        key: `${item.key}:${occurrence.day}`,
        start: occurrence.startsAt,
        end: occurrence.endsAt,
        occurrence: occurrence.day,
      }));
    })
    .concat(classes)
    .sort(compareAgendaByDay);
}

/**
 * Les cours de [from, to[, calculés depuis la semaine type (pendant les semestres, hors vacances) :
 * une ligne par cours et par jour, jamais stockée (P8, P15).
 */
async function listClassItems(db: Db, from: string, to: string): Promise<AgendaItem[]> {
  const slots = await listSlots(db);
  if (slots.length === 0) return [];
  const periods = await listPeriods(db);
  return classesBetween(slots, periods, from, to).map(({ slot, day, start, end }) => ({
    key: `class:${slot.id}:class:${day}`,
    source: 'class',
    id: slot.id,
    kind: 'class',
    title: slotTitle(slot),
    detail: slotRoom(slot),
    start,
    end,
    allDay: false,
    projectId: null,
    color: slot.subjectColor,
    amountCents: null,
    subjectId: slot.subjectId,
  }));
}

// ─── Événements ─────────────────────────────────────────────────────────────

type EventRow = Omit<AgendaEvent, 'allDay'> & { allDay: number };

const EVENT_COLUMNS = `e.id, e.title, e.kind, e.all_day, e.starts_at, e.ends_at, e.location, e.notes, e.project_id,
            p.name AS project_name, COALESCE(p.color, pt.color) AS project_color, e.created_at, e.recurrence`;

export async function getEvent(db: Db, id: string): Promise<AgendaEvent | undefined> {
  const row = await db.queryOne<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     WHERE e.id = ?`,
    [id],
  );
  return row && { ...row, allDay: row.allDay === 1 };
}

/**
 * Événements d'un projet qui ne sont pas encore passés (en cours compris), du plus proche au plus lointain.
 * Un événement à heure fixe compte jusqu'à la fin de sa journée. Un événement qui se répète y figure
 * une fois, à sa prochaine occurrence (rien si sa série est finie).
 */
export async function listProjectEvents(db: Db, projectId: string, today: string): Promise<AgendaEvent[]> {
  const rows = await db.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     WHERE e.project_id = ? AND (e.recurrence IS NOT NULL OR substr(COALESCE(e.ends_at, e.starts_at), 1, 10) >= ?)
     ORDER BY e.starts_at, e.title`,
    [projectId, today],
  );
  const exceptions = await listExceptions(db, rows.filter((row) => row.recurrence !== null).map((row) => row.id));
  return rows
    .flatMap((row): AgendaEvent[] => {
      const event = { ...row, allDay: row.allDay === 1 };
      if (row.recurrence === null) return [event];
      const next = nextOccurrence(row, exceptions.get(row.id) ?? [], today);
      return next ? [{ ...event, startsAt: next.startsAt, endsAt: next.endsAt, occurrence: next.day }] : [];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'fr'));
}

/**
 * Occurrences des événements qui se répètent et touchent [from, to[, chacune avec son événement.
 * `where` restreint les événements (alias `e`), par exemple à ceux à heure fixe : jamais de valeur
 * venue de l'interface dedans.
 */
export async function listRecurringOccurrences(
  db: Db,
  from: string,
  to: string,
  where = '1',
): Promise<{ event: AgendaEvent; startsAt: string; endsAt: string | null; day: string }[]> {
  const rows = await db.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     WHERE e.recurrence IS NOT NULL AND e.starts_at < ? AND (${where})`,
    [to],
  );
  const exceptions = await listExceptions(db, rows.map((row) => row.id));
  return rows.flatMap((row) => {
    const event = { ...row, allDay: row.allDay === 1 };
    return expandSeries(row, exceptions.get(row.id) ?? [], from, to).map((occurrence) => ({
      event,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      day: occurrence.day,
    }));
  });
}

export function insertEventStatement(id: string, input: NewEventInput, now: string): Statement {
  const { allDay, startsAt, endsAt } = timingColumns(input.timing);
  return {
    sql: `INSERT INTO events
            (id, title, kind, all_day, starts_at, ends_at, location, notes, project_id, recurrence, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id,
      input.title.trim(),
      input.kind,
      allDay,
      startsAt,
      endsAt,
      input.location?.trim() || null,
      input.notes?.trim() || null,
      input.projectId,
      input.recurrence ? formatRecurrence(input.recurrence) : null,
      now,
      now,
    ],
  };
}

/** Réinsère un événement supprimé à l'identique (annulation). */
export function restoreEventStatement(event: AgendaEvent, now: string): Statement {
  return {
    sql: `INSERT INTO events
            (id, title, kind, all_day, starts_at, ends_at, location, notes, project_id, recurrence, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      event.id,
      event.title,
      event.kind,
      event.allDay,
      event.startsAt,
      event.endsAt,
      event.location,
      event.notes,
      event.projectId,
      event.recurrence,
      event.createdAt,
      now,
    ],
  };
}

const PATCH_COLUMNS: Record<keyof EventPatch, string> = {
  title: 'title',
  kind: 'kind',
  allDay: 'all_day',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  location: 'location',
  notes: 'notes',
  projectId: 'project_id',
  recurrence: 'recurrence',
};

export function updateEventStatement(id: string, patch: EventPatch, now: string): Statement {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const key of Object.keys(patch) as (keyof EventPatch)[]) {
    sets.push(`${PATCH_COLUMNS[key]} = ?`);
    params.push(patch[key] ?? null);
  }
  sets.push('updated_at = ?');
  params.push(now);
  return { sql: `UPDATE events SET ${sets.join(', ')} WHERE id = ?`, params: [...params, id] };
}

/**
 * Glisser dans le calendrier : l'événement change de jour, ses heures gardées ; un événement sur
 * plusieurs jours garde sa durée.
 */
export function shiftEventStatement(id: string, days: number, now: string): Statement {
  const modifier = sqlDaysModifier(days);
  return {
    sql: `UPDATE events
          SET starts_at = date(substr(starts_at, 1, 10), ?) || substr(starts_at, 11),
              ends_at = date(substr(ends_at, 1, 10), ?) || substr(ends_at, 11),
              updated_at = ?
          WHERE id = ?`,
    params: [modifier, modifier, now, id],
  };
}

export function deleteEventStatement(id: string): Statement {
  return { sql: 'DELETE FROM events WHERE id = ?', params: [id] };
}
