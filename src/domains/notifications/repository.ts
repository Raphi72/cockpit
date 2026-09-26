import { addDaysISO } from '@/core/dates';
import type { Db, Statement } from '@/core/db';
import { CONFIRMED_PROJECT, OPEN_PROJECT } from '@/domains/agenda/repository';
import { EXPECTED_PAYMENT } from '@/domains/finance/payments/repository';
import type { DeadlineSource, ExpectedPayment, PriorityTask, ProjectStart, TimedEvent } from './model';

/** Événements à heure fixe qui commencent entre `from` et `to` ('YYYY-MM-DDTHH:MM', bornes comprises). */
export function listTimedEventsBetween(db: Db, from: string, to: string): Promise<TimedEvent[]> {
  return db.query<TimedEvent>(
    `SELECT id, title, starts_at, location FROM events
     WHERE all_day = 0 AND starts_at >= ? AND starts_at <= ?
     ORDER BY starts_at`,
    [from, to],
  );
}

/**
 * Deadlines d'aujourd'hui à J+3 : projets ouverts et validés (pas les Propositions), et événements
 * « Échéance » (à leur premier jour, comme dans le bloc Deadlines du dashboard).
 */
export function listDeadlinesSoon(db: Db, today: string): Promise<DeadlineSource[]> {
  const limit = addDaysISO(today, 3);
  return db.query<DeadlineSource>(
    `SELECT 'project' AS source, p.id, p.name AS title, p.deadline AS date
     FROM projects p
     WHERE p.deadline >= ? AND p.deadline <= ? AND ${CONFIRMED_PROJECT}
     UNION ALL
     SELECT 'event', e.id, e.title, substr(e.starts_at, 1, 10)
     FROM events e
     WHERE e.kind = 'deadline' AND substr(e.starts_at, 1, 10) >= ? AND substr(e.starts_at, 1, 10) <= ?
     ORDER BY date, source DESC, title`,
    [today, limit, today, limit],
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
