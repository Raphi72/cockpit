import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { batchContext } from '@/core/batch';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import type { TaskItem, TreePlacement } from '@/domains/tasks/model';
import { toast } from '@/ui/overlays/toast';
import type { Idea } from './model';
import {
  deleteIdeaStatement,
  insertIdeaStatement,
  listProjectIdeas,
  renameIdeaStatement,
  restoreIdeaStatement,
} from './repository';
import { buildIdeaToTaskBatch, buildTaskToIdeaBatch, buildUndoIdeaToTaskBatch, buildUndoTaskToIdeaBatch } from './service';

export function useProjectIdeas(projectId: string) {
  return useQuery({ queryKey: queryKeys.ideas.project(projectId), queryFn: () => listProjectIdeas(db, projectId) });
}

function invalidateIdeas(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.ideas.all });
}

export function useCreateIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; title: string }) =>
      db.batch([insertIdeaStatement({ id: newId(), ...input }, nowTimestamp())]),
    onSuccess: () => invalidateIdeas(queryClient),
  });
}

export function useRenameIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => db.batch([renameIdeaStatement(id, title, nowTimestamp())]),
    onSuccess: () => invalidateIdeas(queryClient),
  });
}

/** Suppression avec « Annuler » : l'idée revient à sa place. */
export function useDeleteIdea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idea: Idea) => db.batch([deleteIdeaStatement(idea.id)]),
    onSuccess: (_result, idea) => {
      invalidateIdeas(queryClient);
      toast('Idée supprimée.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            void db.batch([restoreIdeaStatement(idea, nowTimestamp())]).then(() => invalidateIdeas(queryClient));
          },
        },
      });
    },
  });
}

/** Idées et tâches ont bougé : les deux listes du projet, sa progression, le calendrier. */
function invalidateIdeasAndTasks(queryClient: QueryClient) {
  invalidateIdeas(queryClient);
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
}

/**
 * L'idée devient une tâche du projet (en fin de liste, ou à la place où on l'a déposée) ;
 * « Annuler » la remet dans les idées.
 */
export function useIdeaToTask() {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateIdeasAndTasks(queryClient);
  return useMutation({
    mutationFn: async ({ idea, placement }: { idea: Idea; placement?: TreePlacement }) => {
      const { taskId, statements } = buildIdeaToTaskBatch(idea, batchContext(), placement);
      await db.batch(statements);
      return taskId;
    },
    onSuccess: (taskId, { idea }) => {
      invalidate();
      toast('Idée transformée en tâche.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            void db.batch(buildUndoIdeaToTaskBatch(idea, taskId, nowTimestamp())).then(invalidate);
          },
        },
      });
    },
  });
}

/**
 * La tâche glissée dans les idées redevient une idée (seul son titre reste) ; « Annuler » remet la
 * tâche à l'identique. Une tâche qui a des sous-tâches ne peut pas : elles seraient perdues.
 */
export function useTaskToIdea() {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateIdeasAndTasks(queryClient);
  return useMutation({
    mutationFn: async (task: TaskItem) => {
      const { ideaId, statements } = buildTaskToIdeaBatch(task, batchContext());
      await db.batch(statements);
      return ideaId;
    },
    onSuccess: (ideaId, task) => {
      invalidate();
      toast('Tâche transformée en idée.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            void db.batch(buildUndoTaskToIdeaBatch(task, ideaId, nowTimestamp())).then(invalidate);
          },
        },
      });
    },
  });
}
