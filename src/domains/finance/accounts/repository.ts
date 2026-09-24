import type { Db, Statement } from '@/core/db';
import type { Account } from './model';

/** Comptes actifs, le compte pro en premier, avec leur solde calculé (vue `account_balances`). */
export function listAccounts(db: Db): Promise<Account[]> {
  return db.query<Account>(
    `SELECT a.id, a.name, a.kind, b.balance_cents
     FROM accounts a
     JOIN account_balances b ON b.account_id = a.id
     WHERE a.archived_at IS NULL
     ORDER BY a.kind = 'business' DESC, a.sort_order`,
  );
}

/**
 * Ajustement qui amène le solde du compte à `targetCents`. La différence est calculée
 * par SQLite au moment de l'écriture (jamais à partir d'un solde affiché, peut-être périmé) ;
 * si le solde est déjà le bon, rien n'est inséré.
 */
export function adjustBalanceStatement(
  row: { id: string; accountId: string; targetCents: number; date: string; label: string },
  now: string,
): Statement {
  return {
    sql: `INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, created_at, updated_at)
          SELECT ?, account_id, 'adjustment', ? - balance_cents, ?, ?, ?, ?
          FROM account_balances
          WHERE account_id = ? AND balance_cents <> ?`,
    params: [row.id, row.targetCents, row.date, row.label, now, now, row.accountId, row.targetCents],
  };
}

/** Nombre d'ajustements : tant qu'il n'y en a aucun, aucun solde n'a été saisi. */
export async function countAdjustments(db: Db): Promise<number> {
  const row = await db.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM transactions WHERE kind = 'adjustment'");
  return row?.count ?? 0;
}
