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

// ─── Agenda (P8) ────────────────────────────────────────────────────────────

/** Projet dont les tâches restent visibles : ni terminé, ni annulé, ni archivé. */
export const OPEN_PROJECT = `p.status NOT IN ('done', 'cancelled') AND p.archived_at IS NULL`;

/** Projet dont le début et la deadline sont dans l'agenda : ouvert et validé (pas une Proposition). */
export const CONFIRMED_PROJECT = `${OPEN_PROJECT} AND p.status <> 'proposal'`;

type AgendaRow = Omit<AgendaItem, 'key' | 'allDay'> & { allDay: number };

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
            e.starts_at AS "start", e.ends_at AS "end", e.all_day, e.project_id, pt.color, NULL AS amount_cents
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     -- 'YYYY-MM-DDTHH:MM' se trie après 'YYYY-MM-DD' : les comparaisons de texte suffisent.
     WHERE e.starts_at < ? AND COALESCE(e.ends_at, e.starts_at) >= ?

     UNION ALL
     SELECT 'project', p.id, 'project_start', p.name, NULL, p.start_date, NULL, 1, p.id, pt.color, NULL
     FROM projects p
     JOIN project_types pt ON pt.id = p.type_id
     WHERE p.start_date >= ? AND p.start_date < ? AND ${CONFIRMED_PROJECT}

     UNION ALL
     SELECT 'project', p.id, 'project_deadline', p.name, NULL, p.deadline, NULL, 1, p.id, pt.color, NULL
     FROM projects p
     JOIN project_types pt ON pt.id = p.type_id
     WHERE p.deadline >= ? AND p.deadline < ? AND ${CONFIRMED_PROJECT}

     UNION ALL
     SELECT 'task', t.id, CASE WHEN t.due_date IS NULL THEN 'task_scheduled' ELSE 'task_due' END,
            t.title, p.name, ${TASK_FIRST_DAY}, CASE WHEN t.scheduled_date < t.due_date THEN t.due_date END,
            1, t.project_id, pt.color, NULL
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     WHERE t.status <> 'done' AND (p.id IS NULL OR (${OPEN_PROJECT}))
       AND (t.due_date IS NOT NULL OR t.priority >= 2 OR ?)
       AND ${TASK_FIRST_DAY} < ? AND COALESCE(t.due_date, t.scheduled_date) >= ?

     UNION ALL
     SELECT 'payment', pay.id, 'payment_due', COALESCE(p.name, c.name, pay.label),
            CASE WHEN COALESCE(p.name, c.name) IS NULL THEN NULL ELSE pay.label END,
            pay.due_date, NULL, 1, pay.project_id, pt.color, pay.amount_cents
     FROM payments pay
     LEFT JOIN projects p ON p.id = pay.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     LEFT JOIN clients c ON c.id = pay.client_id
     WHERE ${EXPECTED_PAYMENT} AND pay.due_date >= ? AND pay.due_date < ?`,
    [to, from, from, to, from, to, options.plainTasks ? 1 : 0, to, from, from, to],
  );
  return rows
    .map(({ allDay, ...row }) => ({ ...row, key: `${row.source}:${row.id}:${row.kind}`, allDay: allDay === 1 }))
    .sort(compareAgendaByDay);
}

// ─── Événements ─────────────────────────────────────────────────────────────

type EventRow = Omit<AgendaEvent, 'allDay'> & { allDay: number };

export async function getEvent(db: Db, id: string): Promise<AgendaEvent | undefined> {
  const row = await db.queryOne<EventRow>(
    `SELECT e.id, e.title, e.kind, e.all_day, e.starts_at, e.ends_at, e.location, e.notes, e.project_id,
            p.name AS project_name, pt.color AS project_color, e.created_at
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
 * Un événement à heure fixe compte jusqu'à la fin de sa journée.
 */
export async function listProjectEvents(db: Db, projectId: string, today: string): Promise<AgendaEvent[]> {
  const rows = await db.query<EventRow>(
    `SELECT e.id, e.title, e.kind, e.all_day, e.starts_at, e.ends_at, e.location, e.notes, e.project_id,
            p.name AS project_name, pt.color AS project_color, e.created_at
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_types pt ON pt.id = p.type_id
     WHERE e.project_id = ? AND substr(COALESCE(e.ends_at, e.starts_at), 1, 10) >= ?
     ORDER BY e.starts_at, e.title`,
    [projectId, today],
  );
  return rows.map((row) => ({ ...row, allDay: row.allDay === 1 }));
}

export function insertEventStatement(id: string, input: NewEventInput, now: string): Statement {
  const { allDay, startsAt, endsAt } = timingColumns(input.timing);
  return {
    sql: `INSERT INTO events
            (id, title, kind, all_day, starts_at, ends_at, location, notes, project_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      now,
      now,
    ],
  };
}

/** Réinsère un événement supprimé à l'identique (annulation). */
export function restoreEventStatement(event: AgendaEvent, now: string): Statement {
  return {
    sql: `INSERT INTO events
            (id, title, kind, all_day, starts_at, ends_at, location, notes, project_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
