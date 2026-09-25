import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { addDaysISO, nowTimestamp } from '@/core/dates';
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
  listParentCandidates,
  listSubtasks,
  listTasksAround,
  restoreTaskFieldsStatement,
  restoreTaskStatement,
  sortOrderStatements,
  updateTaskStatements,
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

/** Terminées un jour passé : le bilan de ce jour-là, sur le dashboard. */
export function useDoneOn(day: string, enabled = true) {
  const since = startOfDayTimestamp(day);
  const until = startOfDayTimestamp(addDaysISO(day, 1));
  return useQuery({
    queryKey: queryKeys.tasks.done({ since, until }),
    queryFn: () => listDoneTasks(db, { since, until }),
    enabled,
  });
}

export function useDoneTasks() {
  return useQuery({ queryKey: queryKeys.tasks.done({ recent: true }), queryFn: () => listDoneTasks(db) });
}

export function useProjectTasks(projectId: string) {
  return useQuery({ queryKey: queryKeys.tasks.project(projectId), queryFn: () => listProjectTasks(db, projectId) });
}

export function useSubtasks(parentId: string) {
  return useQuery({ queryKey: queryKeys.tasks.subtasks(parentId), queryFn: () => listSubtasks(db, parentId) });
}

export function useParentCandidates(task: Pick<TaskItem, 'id' | 'projectId'>) {
  return useQuery({
    queryKey: queryKeys.tasks.parentCandidates(task.id, task.projectId),
    queryFn: () => listParentCandidates(db, task),
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id ?? ''),
    queryFn: async () => (id ? ((await getTask(db, id)) ?? null) : null),
    enabled: id !== null,
  });
}

// ─── Écritures ──────────────────────────────────────────────────────────────

/** Les tâches font bouger la progression des projets, le bloc « À surveiller » et le calendrier. */
function invalidateAfterTaskChange(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
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
    // La parente et les sous-tâches suivent (voir updateTaskStatements) : rechargées après coup.
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => db.batch(updateTaskStatements(id, patch, nowTimestamp())),
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

const tasksWord = (count: number) => `${count} tâche${count > 1 ? 's' : ''}`;

/**
 * Même changement sur plusieurs tâches (sélection) : début, deadline, priorité ou « terminées ».
 * « Annuler » remet chaque tâche touchée comme avant, parentes et sous-tâches comprises.
 */
export function useBulkUpdateTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: TaskPatch }) => {
      const before = await listTasksAround(db, ids);
      const now = nowTimestamp();
      await db.batch(ids.flatMap((id) => updateTaskStatements(id, patch, now)));
      return before;
    },
    onSuccess: (before, { ids }) => {
      invalidateAfterTaskChange(queryClient);
      toast(`${tasksWord(ids.length)} modifiée${ids.length > 1 ? 's' : ''}.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            const now = nowTimestamp();
            void db
              .batch(before.map((task) => restoreTaskFieldsStatement(task, now)))
              .then(() => invalidateAfterTaskChange(queryClient));
          },
        },
      });
    },
  });
}

/** Suppression de plusieurs tâches (et de leurs sous-tâches) ; « Annuler » les remet toutes. */
export function useBulkDeleteTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const removed = (await listTasksAround(db, ids)).filter((t) => ids.includes(t.id) || (t.parentId && ids.includes(t.parentId)));
      await db.batch(ids.map((id) => deleteTaskStatement(id)));
      return removed;
    },
    onSuccess: (removed, ids) => {
      invalidateAfterTaskChange(queryClient);
      toast(`${tasksWord(ids.length)} supprimée${ids.length > 1 ? 's' : ''}.`, {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            const now = nowTimestamp();
            // Les parentes avant leurs sous-tâches (clé étrangère).
            const ordered = [...removed].sort((a, b) => Number(a.parentId !== null) - Number(b.parentId !== null));
            void db
              .batch(ordered.map((task) => restoreTaskStatement(task, now)))
              .then(() => invalidateAfterTaskChange(queryClient));
          },
        },
      });
    },
  });
}

/**
 * Suppression avec « Annuler » : la tâche part avec ses sous-tâches, et « Annuler » les réinsère
 * toutes à l'identique (la parente d'abord).
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (task: TaskItem) => {
      const subtasks = await listSubtasks(db, task.id);
      await db.batch([deleteTaskStatement(task.id)]);
      return subtasks;
    },
    onSuccess: (subtasks, task) => {
      invalidateAfterTaskChange(queryClient);
      const count = subtasks.length;
      toast(count > 0 ? `Tâche supprimée, avec ${count} sous-tâche${count > 1 ? 's' : ''}.` : 'Tâche supprimée.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () => {
            const now = nowTimestamp();
            void db
              .batch([task, ...subtasks].map((t) => restoreTaskStatement(t, now)))
              .then(() => invalidateAfterTaskChange(queryClient));
          },
        },
      });
    },
  });
}
