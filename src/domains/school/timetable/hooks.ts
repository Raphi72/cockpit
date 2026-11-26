import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { reinsertRowStatement } from '@/core/db/rows';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { invalidateSchool } from '../invalidate';
import type { SlotInput } from './model';
import { deleteSlotStatement, getSlotRow, insertSlotStatement, listSlots, updateSlotStatement } from './repository';

export function useSlots() {
  return useQuery({ queryKey: queryKeys.school.slots, queryFn: () => listSlots(db) });
}

/** Ajoute un cours à la semaine type (sans `id`), ou le modifie. */
export function useSaveSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SlotInput }) =>
      db.batch([id ? updateSlotStatement(id, input, nowTimestamp()) : insertSlotStatement(newId(), input, nowTimestamp())]),
    onSuccess: () => invalidateSchool(queryClient),
  });
}

/** Retire un cours de la semaine type ; « Annuler » le remet. */
export function useDeleteSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const row = await getSlotRow(db, id);
      await db.batch([deleteSlotStatement(id)]);
      return row;
    },
    onSuccess: (row) => {
      invalidateSchool(queryClient);
      if (!row) return;
      toast('Cours retiré de l’emploi du temps.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch([reinsertRowStatement('timetable_slots', row)]).then(() => invalidateSchool(queryClient)),
        },
      });
    },
  });
}
