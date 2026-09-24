import { addDaysISO, monthOf, monthRange } from '@/core/dates';
import type { Db } from '@/core/db';
import { UPCOMING_DAYS, type AccountFigure, type FinanceSummary } from './model';

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

  const totals = await db.queryOne<Omit<FinanceSummary, 'accounts'>>(
    `SELECT
       COALESCE(SUM(CASE WHEN status <> 'received' THEN amount_cents END), 0) AS due_cents,
       COALESCE(SUM(CASE WHEN status <> 'received' AND due_date < ? THEN amount_cents END), 0) AS late_cents,
       COUNT(CASE WHEN status <> 'received' AND due_date < ? THEN 1 END) AS late_count,
       COALESCE(SUM(CASE WHEN status = 'received' AND received_date >= ? AND received_date < ? THEN amount_cents END), 0)
         AS received_month_cents,
       COALESCE(SUM(CASE WHEN status <> 'received' AND due_date >= ? AND due_date <= ? THEN amount_cents END), 0)
         AS upcoming_cents,
       (SELECT COALESCE(SUM(t.amount_cents), 0)
          FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE a.kind = 'business' AND t.kind = 'expense' AND t.date >= ? AND t.date < ?) AS business_expense_month_cents
     FROM payments`,
    [today, today, from, to, today, addDaysISO(today, UPCOMING_DAYS), from, to],
  );

  return { accounts, ...totals! };
}
