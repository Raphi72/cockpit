import { useMutation, useQuery } from '@tanstack/react-query';
import { batchContext } from '@/core/batch';
import { db } from '@/core/db';
import { formatSignedMoney } from '@/core/money';
import { queryKeys } from '@/core/query-keys';
import { getSetting, setSettingStatement } from '@/domains/settings/repository';
import { toast } from '@/ui/overlays/toast';
import { useInvalidateMoney } from '../hooks';
import { deleteTransactionStatement } from '../transactions/repository';
import { INITIAL_BALANCES_SETTING, adjustmentCents, type Account, type AccountKind } from './model';
import {
  adjustBalanceStatement,
  countAdjustments,
  insertAccountStatement,
  listAccounts,
  listManagedAccounts,
  setAccountArchivedStatement,
  updateAccountStatement,
} from './repository';

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.finance.accounts, queryFn: () => listAccounts(db) });
}

/** Paramètres › Comptes : tous les comptes, archivés compris. */
export function useManagedAccounts() {
  return useQuery({ queryKey: queryKeys.finance.managedAccounts, queryFn: () => listManagedAccounts(db) });
}

export function useCreateAccount() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (account: { name: string; kind: AccountKind }) => {
      const ctx = batchContext();
      return db.batch([insertAccountStatement({ id: ctx.newId(), ...account }, ctx.now)]);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; kind?: AccountKind } }) =>
      db.batch([updateAccountStatement(id, patch)]),
    onSuccess: invalidate,
  });
}

/** Archiver un compte (solde à 0 €) : il sort des soldes et des formulaires, avec « Annuler ». */
export function useArchiveAccount() {
  const invalidate = useInvalidateMoney();
  const setArchived = (id: string, archivedAt: string | null) =>
    db.batch([setAccountArchivedStatement(id, archivedAt)]).then(invalidate);
  return useMutation({
    mutationFn: ({ account, archived }: { account: Account; archived: boolean }) =>
      setArchived(account.id, archived ? batchContext().now : null),
    onSuccess: (_, { account, archived }) => {
      if (!archived) return toast(`Compte « ${account.name} » réactivé.`);
      toast(`Compte « ${account.name} » archivé.`, {
        action: { label: 'Annuler', undo: true, onClick: () => void setArchived(account.id, null) },
      });
    },
  });
}

/**
 * La question « Quel est le solde actuel de tes comptes ? » est posée tant qu'aucun solde
 * n'a été saisi (aucun ajustement) et qu'elle n'a pas déjà reçu de réponse.
 */
export function useNeedsInitialBalances() {
  return useQuery({
    queryKey: queryKeys.finance.needsInitialBalances,
    queryFn: async () => {
      const asked = await getSetting<boolean>(db, INITIAL_BALANCES_SETTING);
      return !asked && (await countAdjustments(db)) === 0;
    },
  });
}

/** Réponse à la question des soldes : un ajustement « Solde initial » par compte renseigné. */
export function useSaveInitialBalances() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (entries: { accountId: string; targetCents: number }[]) => {
      const ctx = batchContext();
      return db.batch([
        ...entries.map((entry) =>
          adjustBalanceStatement({ id: ctx.newId(), ...entry, date: ctx.today, label: 'Solde initial' }, ctx.now),
        ),
        setSettingStatement(INITIAL_BALANCES_SETTING, true),
      ]);
    },
    onSuccess: () => {
      invalidate();
      toast('Soldes enregistrés.');
    },
  });
}

/** Corriger un solde à la main : un ajustement égal à la différence, annulable (P5). */
export function useCorrectBalance() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async ({ account, targetCents }: { account: Account; targetCents: number }) => {
      const ctx = batchContext();
      const id = ctx.newId();
      await db.batch([
        adjustBalanceStatement({ id, accountId: account.id, targetCents, date: ctx.today, label: 'Ajustement' }, ctx.now),
      ]);
      return { id, difference: adjustmentCents(account.balanceCents, targetCents) };
    },
    onSuccess: ({ id, difference }) => {
      invalidate();
      if (difference === null) return;
      toast(`Solde corrigé : ajustement de ${formatSignedMoney(difference)}.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch([deleteTransactionStatement({ id })]).then(invalidate),
        },
      });
    },
  });
}
