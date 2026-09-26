import type { Db, Statement } from '@/core/db';
import type { Account, AccountKind, ManagedAccount } from './model';

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

/** Paramètres › Comptes : tous les comptes, les archivés à la fin, avec leur solde et leur nombre de mouvements. */
export function listManagedAccounts(db: Db): Promise<ManagedAccount[]> {
  return db.query<ManagedAccount>(
    `SELECT a.id, a.name, a.kind, a.archived_at, b.balance_cents,
            (SELECT COUNT(*) FROM transactions t WHERE t.account_id = a.id) AS transaction_count
     FROM accounts a
     JOIN account_balances b ON b.account_id = a.id
     ORDER BY a.archived_at IS NOT NULL, a.kind = 'business' DESC, a.sort_order`,
  );
}

/** Nouveau compte, rangé après les autres. */
export function insertAccountStatement(account: { id: string; name: string; kind: AccountKind }, now: string): Statement {
  return {
    sql: `INSERT INTO accounts (id, name, kind, sort_order, created_at)
          VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts), ?)`,
    params: [account.id, account.name, account.kind, now],
  };
}

export function updateAccountStatement(id: string, patch: { name?: string; kind?: AccountKind }): Statement {
  return {
    sql: 'UPDATE accounts SET name = COALESCE(?, name), kind = COALESCE(?, kind) WHERE id = ?',
    params: [patch.name ?? null, patch.kind ?? null, id],
  };
}

/** Archiver (un horodatage) ou réactiver (`null`) un compte. Ses transactions restent. */
export function setAccountArchivedStatement(id: string, archivedAt: string | null): Statement {
  return { sql: 'UPDATE accounts SET archived_at = ? WHERE id = ?', params: [archivedAt, id] };
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
