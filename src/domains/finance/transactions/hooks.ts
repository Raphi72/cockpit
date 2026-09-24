import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { batchContext } from '@/core/batch';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { useInvalidateMoney } from '../hooks';
import type { CategoryKind, TransactionFilter, TransactionInput, TransactionListItem } from './model';
import {
  deleteCategory,
  deleteTransactionStatement,
  insertCategory,
  insertTransactionStatement,
  listCategories,
  listCategoriesWithUsage,
  listProjectExpenses,
  listTransactionRows,
  listTransactions,
  renameCategory,
} from './repository';
import { buildCreateTransactionBatch, buildUpdateTransactionBatch, deletionTarget } from './service';

// ─── Lectures ───────────────────────────────────────────────────────────────

export function useTransactions(filter: TransactionFilter) {
  return useQuery({ queryKey: queryKeys.transactions.list(filter), queryFn: () => listTransactions(db, filter) });
}

export function useProjectExpenses(projectId: string) {
  return useQuery({
    queryKey: queryKeys.transactions.byProject(projectId),
    queryFn: () => listProjectExpenses(db, projectId),
  });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.finance.categories, queryFn: () => listCategories(db) });
}

export function useCategoriesWithUsage() {
  return useQuery({
    queryKey: [...queryKeys.finance.categories, 'usage'],
    queryFn: () => listCategoriesWithUsage(db),
  });
}

// ─── Écritures ──────────────────────────────────────────────────────────────

export function useCreateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (input: TransactionInput) => db.batch(buildCreateTransactionBatch(input, batchContext())),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: ({ existing, input }: { existing: TransactionListItem; input: TransactionInput }) =>
      db.batch(buildUpdateTransactionBatch(existing, input, batchContext())),
    onSuccess: invalidate,
  });
}

/** Suppression avec « Annuler » : la ligne (ou les deux lignes d'un virement) est réinsérée à l'identique. */
export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (item: TransactionListItem) => {
      const target = deletionTarget(item);
      const rows = await listTransactionRows(db, target);
      await db.batch([deleteTransactionStatement(target)]);
      return rows;
    },
    onSuccess: (rows, item) => {
      invalidate();
      toast(item.kind === 'transfer' ? 'Virement supprimé.' : 'Transaction supprimée.', {
        action: {
          label: 'Annuler',
          onClick: () => {
            const now = nowTimestamp();
            void db.batch(rows.map((row) => insertTransactionStatement(row, now))).then(invalidate);
          },
        },
      });
    },
  });
}

// ─── Catégories ─────────────────────────────────────────────────────────────

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.categories });
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
  };
}

export function useCreateCategory() {
  const onSuccess = useInvalidateCategories();
  return useMutation({
    mutationFn: (input: { name: string; kind: CategoryKind }) => insertCategory(db, { id: newId(), ...input }),
    onSuccess,
  });
}

export function useRenameCategory() {
  const onSuccess = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCategory(db, id, name),
    onSuccess,
  });
}

export function useDeleteCategory() {
  const onSuccess = useInvalidateCategories();
  return useMutation({ mutationFn: (id: string) => deleteCategory(db, id), onSuccess });
}
