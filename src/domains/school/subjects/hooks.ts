import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { invalidateSchool } from '../invalidate';
import { normalizeSubject, removalSummary, type SubjectInput, type SubjectListItem } from './model';
import {
  deleteSubjectStatement,
  getSubject,
  insertSubjectStatement,
  listSubjects,
  readSubjectSnapshot,
  restoreSubjectStatements,
  updateSubjectStatement,
} from './repository';

export function useSubjects() {
  return useQuery({ queryKey: queryKeys.school.subjects, queryFn: () => listSubjects(db) });
}

export function useSubject(id: string) {
  return useQuery({ queryKey: queryKeys.school.subject(id), queryFn: async () => (await getSubject(db, id)) ?? null });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubjectInput) => {
      const id = newId();
      await db.batch([insertSubjectStatement(id, normalizeSubject(input), nowTimestamp())]);
      return id;
    },
    onSuccess: () => invalidateSchool(queryClient),
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SubjectInput }) =>
      db.batch([updateSubjectStatement(id, normalizeSubject(input), nowTimestamp())]),
    onSuccess: () => invalidateSchool(queryClient),
  });
}

/**
 * Supprimer une matière emporte ses devoirs, ses cours, ses examens et ses notes. Le toast dit ce qui
 * est parti ; « Annuler » remet tout à l'identique.
 */
export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (subject: Pick<SubjectListItem, 'id'>) => {
      const snapshot = await readSubjectSnapshot(db, subject.id);
      if (!snapshot) return null;
      await db.batch([deleteSubjectStatement(subject.id)]);
      return snapshot;
    },
    onSuccess: (snapshot) => {
      invalidateSchool(queryClient);
      if (!snapshot) return;
      const removal = {
        homework: snapshot.tasks.filter((t) => t.parentId === null).length,
        slots: snapshot.slots.length,
        exams: snapshot.exams.length,
        grades: snapshot.grades.length,
        courses: snapshot.courses.length,
      };
      toast(removalSummary(removal), {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => void db.batch(restoreSubjectStatements(snapshot)).then(() => invalidateSchool(queryClient)),
        },
      });
    },
  });
}
