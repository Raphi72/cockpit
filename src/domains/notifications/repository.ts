import { addDaysISO } from '@/core/dates';
import type { Db, Statement } from '@/core/db';
import { CONFIRMED_PROJECT, OPEN_PROJECT, listRecurringOccurrences } from '@/domains/agenda/repository';
import { EXPECTED_PAYMENT } from '@/domains/finance/payments/repository';
import type { DeadlineSource, ExpectedPayment, PriorityTask, ProjectStart, TimedEvent } from './model';

/**
 * Événements à heure fixe qui commencent entre `from` et `to` ('YYYY-MM-DDTHH:MM', bornes comprises).
 * Pour un événement qui se répète : ses occurrences, chacune à son heure.
 */
export async function listTimedEventsBetween(db: Db, from: string, to: string): Promise<TimedEvent[]> {
  const single = await db.query<TimedEvent>(
    `SELECT id, title, starts_at, location FROM events
     WHERE all_day = 0 AND recurrence IS NULL AND starts_at >= ? AND starts_at <= ?
     ORDER BY starts_at`,
    [from, to],
  );
  const recurring = await listRecurringOccurrences(db, from.slice(0, 10), addDaysISO(to.slice(0, 10), 1), 'e.all_day = 0');
  const occurrences = recurring
    .filter((occurrence) => occurrence.startsAt >= from && occurrence.startsAt <= to)
    .map(({ event, startsAt }) => ({ id: event.id, title: event.title, startsAt, location: event.location }));
  // Les rendez-vous de Google Agenda (agendas affichés) sont rappelés comme les autres.
  const google = await db.query<TimedEvent>(
    `SELECT g.calendar_id || '|' || g.id AS id, g.title, g.starts_at, g.location FROM google_events g
     JOIN google_calendars c ON c.id = g.calendar_id
     WHERE c.shown = 1 AND g.all_day = 0 AND g.starts_at >= ? AND g.starts_at <= ?`,
    [from, to],
  );
  return [...single, ...occurrences, ...google].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * Deadlines d'aujourd'hui à J+3 : projets ouverts et validés (pas les Propositions), et événements
 * « Échéance » (à leur premier jour, comme dans le bloc Deadlines du dashboard). Une échéance qui se
 * répète compte à chacune de ses occurrences.
 */
export async function listDeadlinesSoon(db: Db, today: string): Promise<DeadlineSource[]> {
  const limit = addDaysISO(today, 3);
  const single = await db.query<DeadlineSource>(
    `SELECT 'project' AS source, p.id, p.name AS title, p.deadline AS date
     FROM projects p
     WHERE p.deadline >= ? AND p.deadline <= ? AND ${CONFIRMED_PROJECT}
     UNION ALL
     SELECT 'event', e.id, e.title, substr(e.starts_at, 1, 10)
     FROM events e
     WHERE e.kind = 'deadline' AND e.recurrence IS NULL
       AND substr(e.starts_at, 1, 10) >= ? AND substr(e.starts_at, 1, 10) <= ?`,
    [today, limit, today, limit],
  );
  const recurring = await listRecurringOccurrences(db, today, addDaysISO(limit, 1), "e.kind = 'deadline'");
  const occurrences = recurring
    .map(({ event, startsAt }): DeadlineSource => ({ source: 'event', id: event.id, title: event.title, date: startsAt.slice(0, 10) }))
    .filter((deadline) => deadline.date >= today && deadline.date <= limit);
  // Par jour, les projets avant les échéances, puis par titre.
  return [...single, ...occurrences].sort(
    (a, b) => a.date.localeCompare(b.date) || b.source.localeCompare(a.source) || a.title.localeCompare(b.title),
  );
}

/** Tâches Haute ou Urgente, à faire, dont la deadline est `day` (hors projets clos). */
export function listPriorityTasksDue(db: Db, day: string): Promise<PriorityTask[]> {
  return db.query<PriorityTask>(
    `SELECT t.id, t.title, t.priority, t.due_date, p.name AS project_name
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.status <> 'done' AND t.priority >= 2 AND t.due_date = ?
       AND (p.id IS NULL OR (${OPEN_PROJECT}))
     ORDER BY t.priority DESC, t.sort_order`,
    [day],
  );
}

/** Encaissements attendus (règle `EXPECTED_PAYMENT`) prévus `tomorrow`, ou en retard. */
export function listPaymentsToNotify(db: Db, today: string, tomorrow: string): Promise<ExpectedPayment[]> {
  return db.query<ExpectedPayment>(
    `SELECT pay.id, pay.label, COALESCE(p.name, c.name) AS name, pay.due_date, pay.amount_cents
     FROM payments pay
     LEFT JOIN projects p ON p.id = pay.project_id
     LEFT JOIN clients c ON c.id = pay.client_id
     WHERE ${EXPECTED_PAYMENT} AND (pay.due_date = ? OR pay.due_date < ?)
     ORDER BY pay.due_date`,
    [tomorrow, today],
  );
}

/** Projets À venir ou En cours qui commencent `day` (ni en pause, ni Proposition). */
export function listProjectsStarting(db: Db, day: string): Promise<ProjectStart[]> {
  return db.query<ProjectStart>(
    `SELECT p.id, p.name, p.start_date, p.status AS saved_status
     FROM projects p
     WHERE p.start_date = ? AND p.status IN ('planned', 'active') AND ${CONFIRMED_PROJECT}
     ORDER BY p.name`,
    [day],
  );
}

// ─── Journal des notifications envoyées ─────────────────────────────────────

/**
 * Réserve une notification avant de l'envoyer : vrai si elle n'était jamais partie. Une instruction
 * par clé, pour que deux vérifications simultanées ne l'envoient jamais deux fois.
 */
export async function claimNotification(db: Db, key: string, now: string): Promise<boolean> {
  const { rowsAffected } = await db.execute(
    'INSERT OR IGNORE INTO notification_log (key, sent_at) VALUES (?, ?)',
    [key, now],
  );
  return rowsAffected > 0;
}

/** Le journal ne sert qu'à ne pas répéter une notification : les vieilles lignes sont oubliées. */
export function pruneNotificationLogStatement(before: string): Statement {
  return { sql: 'DELETE FROM notification_log WHERE sent_at < ?', params: [before] };
}
