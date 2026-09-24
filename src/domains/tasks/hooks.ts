import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { startOfDayTimestamp, type NewTaskInput, type TaskItem, type TaskPatch } from './model';
import {
  deleteTaskStatement,
  getTask,
  insertTaskStatement,
  listDoneTasks,
  listOpenTasks,
  listProjectTasks,
  restoreTaskStatement,
  sortOrderStatements,
  updateTaskStatement,
} from './repository';

// ─── Lectures ───────────────────────────────────────────────────────────────

export function useOpenTasks() {
  return useQuery({ queryKey: queryKeys.tasks.open, queryFn: () => listOpenTasks(db) });
}

/** Terminées depuis le début de la journée (repliées sous la vue Aujourd'hui). */
export function useDoneToday(today: string) {
  const since = startOfDayTimestamp(today);
  return useQuery({ queryKey: queryKeys.tasks.done({ since }), queryFn: () => listDoneTasks(db, { since }) });
}

export function useDoneTasks() {
  return useQuery({ queryKey: queryKeys.tasks.done({ recent: true }), queryFn: () => listDoneTasks(db) });
}

export function useProjectTasks(projectId: string) {
  return useQuery({ queryKey: queryKeys.tasks.project(projectId), queryFn: () => listProjectTasks(db, projectId) });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id ?? ''),
    queryFn: async () => (id ? ((await getTask(db, id)) ?? null) : null),
    enabled: id !== null,
  });
}

// ─── Écritures ──────────────────────────────────────────────────────────────

/** Les tâches font bouger la progression des projets et le bloc « À surveiller ». */
function invalidateAfterTaskChange(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
}

/** Applique un changement à toutes les listes et fiches en cache, avant la base : rien n'attend. */
function patchCachedTask(queryClient: QueryClient, id: string, patch: Partial<TaskItem>) {
  queryClient.setQueriesData<TaskItem[] | TaskItem | null>({ queryKey: queryKeys.tasks.all }, (data) => {
    if (Array.isArray(data)) return data.map((t) => (t.id === id ? { ...t, ...patch } : t));
    if (data && data.id === id) return { ...data, ...patch };
    return data;
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTaskInput) => {
      const id = newId();
      await db.batch([insertTaskStatement(id, input, nowTimestamp())]);
      return id;
    },
    onSuccess: () => invalidateAfterTaskChange(queryClient),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      db.batch([updateTaskStatement(id, patch, nowTimestamp())]),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const completedAt = patch.status === undefined ? {} : { completedAt: patch.status === 'done' ? nowTimestamp() : null };
      patchCachedTask(queryClient, id, { ...patch, ...completedAt });
    },
    onSettled: () => invalidateAfterTaskChange(queryClient),
  });
}

/** Réordonne une liste : l'ordre est appliqué tout de suite dans le cache de cette liste. */
export function useReorderTasks(listKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) => db.batch(sortOrderStatements(updates, nowTimestamp())),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const orders = new Map(updates.map((u) => [u.id, u.sortOrder]));
      queryClient.setQueryData<TaskItem[]>(listKey, (tasks) =>
        tasks
          ?.map((t) => (orders.has(t.id) ? { ...t, sortOrder: orders.get(t.id)! } : t))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
    },
    onSettled: () => invalidateAfterTaskChange(queryClient),
  });
}

/** Suppression avec « Annuler » : la tâche est réinsérée à l'identique. */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: TaskItem) => db.batch([deleteTaskStatement(task.id)]),
    onSuccess: (_result, task) => {
      invalidateAfterTaskChange(queryClient);
      toast('Tâche supprimée.', {
        action: {
          label: 'Annuler',
          onClick: () => {
            void db
              .batch([restoreTaskStatement(task, nowTimestamp())])
              .then(() => invalidateAfterTaskChange(queryClient));
          },
        },
      });
    },
  });
}
