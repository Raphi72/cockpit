import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { shorten } from '@/core/text';
import { toast } from '@/ui/overlays/toast';
import { invalidateSchool } from '../invalidate';
import type { ExamInput } from './model';
import {
  deleteExamStatement,
  getExam,
  insertExamStatement,
  listExams,
  readExamSnapshot,
  restoreExamStatements,
  updateExamStatement,
} from './repository';

export function useExams(options: { subjectId?: string } = {}) {
  return useQuery({ queryKey: queryKeys.school.exams(options), queryFn: () => listExams(db, options) });
}

export function useExam(id: string | null) {
  return useQuery({
    queryKey: queryKeys.school.exams({ id }),
    queryFn: async () => (id ? ((await getExam(db, id)) ?? null) : null),
    enabled: id !== null,
  });
}

/** Ajoute un examen (sans `id`) ou le modifie. Renvoie son identifiant. */
export function useSaveExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ExamInput }) => {
      const examId = id ?? newId();
      await db.batch([id ? updateExamStatement(id, input, nowTimestamp()) : insertExamStatement(examId, input, nowTimestamp())]);
      return examId;
    },
    onSuccess: () => invalidateSchool(queryClient),
  });
}

/** Supprimer un examen : sa note reste (sans examen) ; « Annuler » remet l'examen et le lien. */
export function useDeleteExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const snapshot = await readExamSnapshot(db, id);
      await db.batch([deleteExamStatement(id)]);
      return snapshot;
    },
    onSuccess: (snapshot) => {
      invalidateSchool(queryClient);
      if (!snapshot) return;
      toast(`Examen supprimé : ${shorten(String(snapshot.exam.title))}`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch(restoreExamStatements(snapshot)).then(() => invalidateSchool(queryClient)),
        },
      });
    },
  });
}
