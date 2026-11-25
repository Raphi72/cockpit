import { addDaysISO, monthOf, monthRange } from '@/core/dates';
import type { Db } from '@/core/db';
import { UPCOMING_DAYS, type AccountFigure, type FinanceSummary, type MonthRevenue } from './model';
import { EXPECTED_PAYMENT } from './payments/repository';

/** Chiffres de l'en-tête Finances, en deux requêtes agrégées. */
export async function getFinanceSummary(db: Db, today: string): Promise<FinanceSummary> {
  const { from, to } = monthRange(monthOf(today));

  const accounts = await db.query<AccountFigure>(
    `SELECT a.id, a.name, a.kind, b.balance_cents,
            COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount_cents END), 0) AS month_expense_cents,
            COALESCE(SUM(CASE WHEN t.kind <> 'adjustment' THEN t.amount_cents END), 0) AS month_change_cents
     FROM accounts a
     JOIN account_balances b ON b.account_id = a.id
     LEFT JOIN transactions t ON t.account_id = a.id AND t.date >= ? AND t.date < ?
     WHERE a.archived_at IS NULL
     GROUP BY a.id
     ORDER BY a.kind = 'business' DESC, a.sort_order`,
    [from, to],
  );

  // « À recevoir », retards et prévu : seulement l'argent attendu (pas celui des propositions).
  const totals = await db.queryOne<Omit<FinanceSummary, 'accounts'>>(
    `SELECT
       COALESCE(SUM(CASE WHEN ${EXPECTED_PAYMENT} THEN pay.amount_cents END), 0) AS due_cents,
       COALESCE(SUM(CASE WHEN ${EXPECTED_PAYMENT} AND pay.due_date < ? THEN pay.amount_cents END), 0) AS late_cents,
       COUNT(CASE WHEN ${EXPECTED_PAYMENT} AND pay.due_date < ? THEN 1 END) AS late_count,
       COALESCE(SUM(CASE WHEN pay.status = 'received' AND pay.received_date >= ? AND pay.received_date < ?
                         THEN pay.amount_cents END), 0) AS received_month_cents,
       COALESCE(SUM(CASE WHEN ${EXPECTED_PAYMENT} AND pay.due_date >= ? AND pay.due_date <= ?
                         THEN pay.amount_cents END), 0) AS upcoming_cents,
       (SELECT COALESCE(SUM(t.amount_cents), 0)
          FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.kind = 'business' AND t.kind = 'expense' AND t.date >= ? AND t.date < ?) AS business_expense_month_cents
     FROM payments pay
     LEFT JOIN projects p ON p.id = pay.project_id`,
    [today, today, from, to, today, addDaysISO(today, UPCOMING_DAYS), from, to],
  );

  return { accounts, ...totals! };
}

/**
 * Chiffre d'affaires d'une année, mois par mois : les encaissements reçus, à leur date de réception
 * (la règle de « Encaissé ce mois »). Seuls les mois qui en ont sont renvoyés.
 */
export function listRevenueByMonth(db: Db, year: number): Promise<MonthRevenue[]> {
  return db.query<MonthRevenue>(
    `SELECT substr(pay.received_date, 1, 7) AS month, SUM(pay.amount_cents) AS cents, COUNT(*) AS count
     FROM payments pay
     WHERE pay.status = 'received' AND pay.received_date >= ? AND pay.received_date < ?
     GROUP BY month
     ORDER BY month`,
    [`${year}-01-01`, `${year + 1}-01-01`],
  );
}

/** Année du tout premier encaissement reçu, ou `null` s'il n'y en a aucun. */
export async function getFirstRevenueYear(db: Db): Promise<number | null> {
  const row = await db.queryOne<{ first: string | null }>(
    "SELECT MIN(received_date) AS first FROM payments WHERE status = 'received'",
  );
  return row?.first ? Number(row.first.slice(0, 4)) : null;
}
