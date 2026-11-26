import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { reinsertRowStatement } from '@/core/db/rows';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { invalidateSchool } from '../invalidate';
import { normalizeGrade, type GradeInput } from './model';
import { deleteGradeStatement, getGradeRow, insertGradeStatement, listGrades, updateGradeStatement } from './repository';

export function useGrades() {
  return useQuery({ queryKey: queryKeys.school.grades({}), queryFn: () => listGrades(db) });
}

/** Ajoute une note (sans `id`) ou la modifie. */
export function useSaveGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: GradeInput }) => {
      const grade = normalizeGrade(input);
      const now = nowTimestamp();
      return db.batch([id ? updateGradeStatement(id, grade, now) : insertGradeStatement(newId(), grade, now)]);
    },
    onSuccess: () => invalidateSchool(queryClient),
  });
}

/** Supprimer une note ; « Annuler » la remet (avec son lien à l'examen). */
export function useDeleteGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const row = await getGradeRow(db, id);
      await db.batch([deleteGradeStatement(id)]);
      return row;
    },
    onSuccess: (row) => {
      invalidateSchool(queryClient);
      if (!row) return;
      toast('Note supprimée.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch([reinsertRowStatement('grades', row)]).then(() => invalidateSchool(queryClient)),
        },
      });
    },
  });
}
