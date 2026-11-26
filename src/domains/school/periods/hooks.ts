import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { invalidateSchool } from '../invalidate';
import type { PeriodInput, SchoolPeriod } from './model';
import { deletePeriodStatement, insertPeriodStatement, listPeriods, updatePeriodStatement } from './repository';

export function usePeriods() {
  return useQuery({ queryKey: queryKeys.school.periods, queryFn: () => listPeriods(db) });
}

/** Ajoute une ou plusieurs périodes (les deux semestres proposés, par exemple), dans un seul lot. */
export function useAddPeriods() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inputs: PeriodInput[]) => {
      const now = nowTimestamp();
      return db.batch(inputs.map((input) => insertPeriodStatement(newId(), input, now)));
    },
    onSuccess: () => invalidateSchool(queryClient),
  });
}

export function useUpdatePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PeriodInput }) => db.batch([updatePeriodStatement(id, input, nowTimestamp())]),
    onSuccess: () => invalidateSchool(queryClient),
  });
}

/** Supprimer une période : « Annuler » la remet (mêmes dates, même identifiant). */
export function useDeletePeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (period: SchoolPeriod) => db.batch([deletePeriodStatement(period.id)]),
    onSuccess: (_, period) => {
      invalidateSchool(queryClient);
      toast(`« ${period.name} » supprimé${period.kind === 'holiday' ? 'es' : ''}.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () =>
            void db.batch([insertPeriodStatement(period.id, period, nowTimestamp())]).then(() => invalidateSchool(queryClient)),
        },
      });
    },
  });
}
