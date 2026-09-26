/** Compte bancaire (perso ou pro). Son solde n'est jamais stocké : c'est la somme de ses transactions. */
export type AccountKind = 'personal' | 'business';

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  balanceCents: number;
};

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = { business: 'Professionnel', personal: 'Personnel' };

/** Compte vu depuis Paramètres › Comptes : archivés compris. */
export type ManagedAccount = Account & { archivedAt: string | null; transactionCount: number };

/**
 * Pourquoi un compte ne peut pas être archivé, ou `null`. Un compte archivé sort des soldes et des
 * formulaires : il doit être à 0 € (sinon cet argent disparaîtrait des chiffres) et il en faut un autre.
 */
export function archiveBlocker(account: Pick<Account, 'balanceCents'>, activeCount: number): string | null {
  if (activeCount <= 1) return 'Il faut garder au moins un compte.';
  if (account.balanceCents !== 0) {
    return 'Son solde doit être à 0 € : fais d’abord un virement vers un autre compte, ou corrige son solde.';
  }
  return null;
}

/** Clé du réglage qui retient que la question des soldes de départ a été posée. */
export const INITIAL_BALANCES_SETTING = 'finance.initialBalancesAsked';

/**
 * Corriger un solde à la main crée un ajustement égal à la différence (P5).
 * `null` si le solde saisi est déjà le bon : aucun mouvement à créer.
 */
export function adjustmentCents(currentCents: number, targetCents: number): number | null {
  const difference = targetCents - currentCents;
  return difference === 0 ? null : difference;
}

/** Compte proposé par défaut pour un revenu client ou une dépense : le premier compte pro. */
export function defaultAccountId(accounts: Pick<Account, 'id' | 'kind'>[]): string | null {
  return (accounts.find((a) => a.kind === 'business') ?? accounts[0])?.id ?? null;
}

/** Pour un virement, le compte d'arrivée par défaut : le premier autre compte. */
export function otherAccountId(accounts: Pick<Account, 'id'>[], fromId: string | null): string | null {
  return accounts.find((a) => a.id !== fromId)?.id ?? null;
}
