import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { db, type Statement } from '@/core/db';
import { addDaysISO, nowTimestamp } from '@/core/dates';
import { reinsertRowStatement } from '@/core/db/rows';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { shorten } from '@/core/text';
import { useToday } from '@/core/use-today';
import { toast } from '@/ui/overlays/toast';
import type { Exercise, HabitInput, WorkoutSet } from './model';
import {
  deleteGoalStatement,
  deleteStepStatement,
  deleteWorkoutStatement,
  insertExerciseStatement,
  insertGoalStatement,
  insertHabitStatement,
  insertStepStatement,
  listDoneBlocks,
  listExercises,
  listGoals,
  listHabitLogs,
  listHabits,
  listWorkouts,
  saveWorkoutStatements,
  setHabitArchivedStatement,
  setHabitLogStatement,
  setStepDoneStatement,
  updateGoalStatement,
  updateHabitStatement,
} from './repository';
import { buildWeekReview } from './service';

export function invalidateHabits(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.habits.all });
}

const undoToast = (queryClient: QueryClient, message: string, undo: Statement[]) =>
  toast(message, {
    action: { label: 'Annuler', undo: true, onClick: () => void db.batch(undo).then(() => invalidateHabits(queryClient)) },
  });

// ─── Habitudes ──────────────────────────────────────────────────────────────

export function useHabits() {
  return useQuery({ queryKey: queryKeys.habits.list, queryFn: () => listHabits(db) });
}

/** Coches et blocs faits de [from, to[ : de quoi dire, jour par jour, quelles habitudes sont faites. */
export function useHabitActivity(range: { from: string; to: string }) {
  return useQuery({
    queryKey: queryKeys.habits.activity(range.from, range.to),
    queryFn: async () => {
      const [logs, doneBlocks] = await Promise.all([listHabitLogs(db, range.from, range.to), listDoneBlocks(db, range.from, range.to)]);
      return { logs, doneBlocks };
    },
  });
}

/** Depuis quand relire les coches : assez pour une longue série et le taux des 30 derniers jours. */
const HISTORY_DAYS = 400;

/** L'activité des habitudes jusqu'à aujourd'hui inclus. */
export function useHabitHistory() {
  const today = useToday();
  const range = useMemo(() => ({ from: addDaysISO(today, -HISTORY_DAYS), to: addDaysISO(today, 1) }), [today]);
  return useHabitActivity(range);
}

/** Cocher ou décocher une habitude un jour : tout de suite à l'écran, puis en base. */
export function useToggleHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, day, done }: { habitId: string; day: string; done: boolean }) =>
      db.batch([setHabitLogStatement(habitId, day, done, nowTimestamp())]),
    onMutate: async ({ habitId, day, done }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.habits.all });
      queryClient.setQueriesData<{ logs: { habitId: string; day: string }[]; doneBlocks: unknown[] }>(
        { queryKey: [...queryKeys.habits.all, 'activity'] },
        (data) =>
          data && {
            ...data,
            logs: done ? [...data.logs, { habitId, day }] : data.logs.filter((l) => !(l.habitId === habitId && l.day === day)),
          },
      );
    },
    onSettled: () => invalidateHabits(queryClient),
  });
}

export function useSaveHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: HabitInput }) =>
      db.batch([id ? updateHabitStatement(id, input, nowTimestamp()) : insertHabitStatement(newId(), input, nowTimestamp())]),
    onSuccess: () => invalidateHabits(queryClient),
  });
}

/** Arrêter une habitude : archivée (ses coches restent pour les revues passées). « Annuler » la remet. */
export function useArchiveHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => db.batch([setHabitArchivedStatement(id, nowTimestamp(), nowTimestamp())]),
    onSuccess: (_, { id, name }) => {
      invalidateHabits(queryClient);
      undoToast(queryClient, `Habitude « ${shorten(name)} » arrêtée.`, [setHabitArchivedStatement(id, null, nowTimestamp())]);
    },
  });
}

// ─── Objectifs ──────────────────────────────────────────────────────────────

export function useGoals() {
  return useQuery({ queryKey: queryKeys.habits.goals, queryFn: () => listGoals(db) });
}

export function useSaveGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, goal, steps = [] }: { id?: string; goal: { title: string; dueDate: string | null; notes: string | null }; steps?: string[] }) => {
      const now = nowTimestamp();
      const goalId = id ?? newId();
      await db.batch([
        id ? updateGoalStatement(id, goal, now) : insertGoalStatement(goalId, goal, now),
        ...steps.filter((s) => s.trim()).map((title) => insertStepStatement(newId(), goalId, title, now)),
      ]);
      return goalId;
    },
    onSuccess: () => invalidateHabits(queryClient),
  });
}

export function useGoalActions() {
  const queryClient = useQueryClient();
  const run = (statements: Statement[]) => db.batch(statements).then(() => invalidateHabits(queryClient));
  return {
    addStep: (goalId: string, title: string) => run([insertStepStatement(newId(), goalId, title, nowTimestamp())]),
    toggleStep: (stepId: string, done: boolean) => run([setStepDoneStatement(stepId, done ? nowTimestamp() : null)]),
    deleteStep: (stepId: string) => run([deleteStepStatement(stepId)]),
    setAchieved: (goalId: string, achieved: boolean) => run([updateGoalStatement(goalId, { achievedAt: achieved ? nowTimestamp() : null }, nowTimestamp())]),
  };
}

/** Supprimer un objectif (ses étapes avec ; ses habitudes restent) ; « Annuler » remet tout. */
export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const goal = await db.queryOne<Record<string, unknown>>('SELECT * FROM goals WHERE id = ?', [id]);
      const steps = await db.query<Record<string, unknown>>('SELECT * FROM goal_steps WHERE goal_id = ?', [id]);
      const habits = await db.query<{ id: string }>('SELECT id FROM habits WHERE goal_id = ?', [id]);
      await db.batch([deleteGoalStatement(id)]);
      return { goal, steps, habits: habits.map((h) => h.id) };
    },
    onSuccess: ({ goal, steps, habits }) => {
      invalidateHabits(queryClient);
      if (!goal) return;
      undoToast(queryClient, `Objectif « ${shorten(String(goal.title))} » supprimé.`, [
        reinsertRowStatement('goals', goal),
        ...steps.map((row) => reinsertRowStatement('goal_steps', row)),
        ...(habits.length
          ? [{ sql: `UPDATE habits SET goal_id = ? WHERE id IN (${habits.map(() => '?').join(', ')})`, params: [goal.id as string, ...habits] }]
          : []),
      ]);
    },
  });
}

// ─── Séances ────────────────────────────────────────────────────────────────

export function useExercises() {
  return useQuery({ queryKey: queryKeys.habits.exercises, queryFn: () => listExercises(db) });
}

export function useWorkouts() {
  return useQuery({ queryKey: queryKeys.habits.workouts, queryFn: () => listWorkouts(db) });
}

export type WorkoutDraft = {
  id?: string;
  blockId: string | null;
  date: string;
  feeling: number | null;
  notes: string | null;
  /** Les exercices nouveaux sont créés avec la séance. */
  newExercises: Exercise[];
  sets: WorkoutSet[];
};

export function useSaveWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: WorkoutDraft) => {
      const now = nowTimestamp();
      const id = draft.id ?? newId();
      return db.batch([
        ...draft.newExercises.map((e) => insertExerciseStatement(e.id, e, now)),
        ...saveWorkoutStatements(id, draft, !draft.id, now, newId),
      ]);
    },
    onSuccess: (_, draft) => {
      invalidateHabits(queryClient);
      if (!draft.id) toast('Séance notée.');
    },
  });
}

export function useDeleteWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const workout = await db.queryOne<Record<string, unknown>>('SELECT * FROM workouts WHERE id = ?', [id]);
      const sets = await db.query<Record<string, unknown>>('SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY position', [id]);
      await db.batch([deleteWorkoutStatement(id)]);
      return { workout, sets };
    },
    onSuccess: ({ workout, sets }) => {
      invalidateHabits(queryClient);
      if (!workout) return;
      undoToast(queryClient, 'Séance supprimée.', [reinsertRowStatement('workouts', workout), ...sets.map((row) => reinsertRowStatement('workout_sets', row))]);
    },
  });
}

// ─── Revue de la semaine ────────────────────────────────────────────────────

export function useWeekReview(monday: string) {
  return useQuery({ queryKey: queryKeys.habits.review(monday), queryFn: () => buildWeekReview(db, monday) });
}
