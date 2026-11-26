import type { Db, Statement } from '@/core/db';
import { isSportBlock, type Exercise, type Goal, type GoalStep, type Habit, type HabitInput, type Workout, type WorkoutSet } from './model';

// ─── Habitudes ──────────────────────────────────────────────────────────────

type HabitRow = Omit<Habit, 'weekdays'> & { weekdays: string | null };

export async function listHabits(db: Db): Promise<Habit[]> {
  const rows = await db.query<HabitRow>(
    `SELECT id, name, icon, color, frequency, times_per_week, weekdays, reminder_time, module_id, goal_id, sort_order
     FROM habits WHERE archived_at IS NULL ORDER BY sort_order, name`,
  );
  return rows.map((row) => ({ ...row, weekdays: row.weekdays ? row.weekdays.split(',').map(Number) : [] }));
}

const habitValues = (input: HabitInput) => [
  input.name.trim(),
  input.icon,
  input.color,
  input.frequency,
  input.frequency === 'weekly' ? input.timesPerWeek : null,
  input.frequency === 'days' ? [...input.weekdays].sort().join(',') : null,
  input.reminderTime,
  input.moduleId,
  input.goalId,
];

export function insertHabitStatement(id: string, input: HabitInput, now: string): Statement {
  return {
    sql: `INSERT INTO habits (id, name, icon, color, frequency, times_per_week, weekdays, reminder_time, module_id, goal_id, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM habits), 0) + 1, ?, ?)`,
    params: [id, ...habitValues(input), now, now],
  };
}

export function updateHabitStatement(id: string, input: HabitInput, now: string): Statement {
  return {
    sql: `UPDATE habits SET name = ?, icon = ?, color = ?, frequency = ?, times_per_week = ?, weekdays = ?, reminder_time = ?,
            module_id = ?, goal_id = ?, updated_at = ? WHERE id = ?`,
    params: [...habitValues(input), now, id],
  };
}

/** Une habitude abandonnée est archivée : son historique reste (revue des semaines passées). */
export function setHabitArchivedStatement(id: string, archivedAt: string | null, now: string): Statement {
  return { sql: 'UPDATE habits SET archived_at = ?, updated_at = ? WHERE id = ?', params: [archivedAt, now, id] };
}

/** Les coches de [from, to[. */
export function listHabitLogs(db: Db, from: string, to: string): Promise<{ habitId: string; day: string }[]> {
  return db.query('SELECT habit_id, day FROM habit_logs WHERE day >= ? AND day < ? ORDER BY day', [from, to]);
}

/** Les blocs faits de [from, to[ : ils cochent les habitudes de leur module. */
export function listDoneBlocks(db: Db, from: string, to: string): Promise<{ templateId: string | null; date: string }[]> {
  return db.query("SELECT template_id, date FROM day_blocks WHERE status = 'done' AND date >= ? AND date < ?", [from, to]);
}

export function setHabitLogStatement(habitId: string, day: string, done: boolean, now: string): Statement {
  return done
    ? { sql: 'INSERT OR IGNORE INTO habit_logs (habit_id, day, created_at) VALUES (?, ?, ?)', params: [habitId, day, now] }
    : { sql: 'DELETE FROM habit_logs WHERE habit_id = ? AND day = ?', params: [habitId, day] };
}

// ─── Objectifs ──────────────────────────────────────────────────────────────

export async function listGoals(db: Db): Promise<Goal[]> {
  const [goals, steps] = await Promise.all([
    db.query<Omit<Goal, 'steps'>>('SELECT id, title, due_date, notes, achieved_at, sort_order FROM goals ORDER BY achieved_at IS NOT NULL, sort_order'),
    db.query<GoalStep>('SELECT id, goal_id, title, done_at, sort_order FROM goal_steps ORDER BY sort_order'),
  ]);
  return goals.map((goal) => ({ ...goal, steps: steps.filter((s) => s.goalId === goal.id) }));
}

export function insertGoalStatement(id: string, goal: { title: string; dueDate: string | null; notes: string | null }, now: string): Statement {
  return {
    sql: `INSERT INTO goals (id, title, due_date, notes, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM goals), 0) + 1, ?, ?)`,
    params: [id, goal.title.trim(), goal.dueDate, goal.notes, now, now],
  };
}

export function updateGoalStatement(id: string, patch: Partial<{ title: string; dueDate: string | null; notes: string | null; achievedAt: string | null }>, now: string): Statement {
  const columns: Record<string, string> = { title: 'title', dueDate: 'due_date', notes: 'notes', achievedAt: 'achieved_at' };
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  return {
    sql: `UPDATE goals SET ${keys.map((k) => `${columns[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    params: [...keys.map((k) => patch[k] ?? null), now, id],
  };
}

export function deleteGoalStatement(id: string): Statement {
  return { sql: 'DELETE FROM goals WHERE id = ?', params: [id] };
}

export function insertStepStatement(id: string, goalId: string, title: string, now: string): Statement {
  return {
    sql: `INSERT INTO goal_steps (id, goal_id, title, sort_order, created_at)
          VALUES (?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM goal_steps WHERE goal_id = ?), 0) + 1, ?)`,
    params: [id, goalId, title.trim(), goalId, now],
  };
}

export function setStepDoneStatement(id: string, doneAt: string | null): Statement {
  return { sql: 'UPDATE goal_steps SET done_at = ? WHERE id = ?', params: [doneAt, id] };
}

export function deleteStepStatement(id: string): Statement {
  return { sql: 'DELETE FROM goal_steps WHERE id = ?', params: [id] };
}

// ─── Séances ────────────────────────────────────────────────────────────────

export function listExercises(db: Db): Promise<Exercise[]> {
  return db.query<Exercise>('SELECT id, name, kind FROM exercises ORDER BY name');
}

export function insertExerciseStatement(id: string, exercise: Omit<Exercise, 'id'>, now: string): Statement {
  return { sql: 'INSERT INTO exercises (id, name, kind, created_at) VALUES (?, ?, ?, ?)', params: [id, exercise.name.trim(), exercise.kind, now] };
}

export async function listWorkouts(db: Db): Promise<Workout[]> {
  const [workouts, sets] = await Promise.all([
    db.query<Omit<Workout, 'sets'>>('SELECT id, block_id, date, feeling, notes FROM workouts ORDER BY date DESC, created_at DESC'),
    db.query<WorkoutSet & { workoutId: string; position: number }>(
      'SELECT workout_id, exercise_id, position, reps, weight_kg, duration_min, distance_km FROM workout_sets ORDER BY position',
    ),
  ]);
  return workouts.map((w) => ({ ...w, sets: sets.filter((s) => s.workoutId === w.id).map(({ workoutId: _w, ...set }) => set) }));
}

/** Une séance et ses séries, remplacées d'un coup (on enregistre le formulaire entier). */
export function saveWorkoutStatements(
  id: string,
  workout: { blockId: string | null; date: string; feeling: number | null; notes: string | null; sets: WorkoutSet[] },
  isNew: boolean,
  now: string,
  newId: () => string,
): Statement[] {
  const head: Statement = isNew
    ? {
        sql: 'INSERT INTO workouts (id, block_id, date, feeling, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        params: [id, workout.blockId, workout.date, workout.feeling, workout.notes, now, now],
      }
    : { sql: 'UPDATE workouts SET date = ?, feeling = ?, notes = ?, updated_at = ? WHERE id = ?', params: [workout.date, workout.feeling, workout.notes, now, id] };
  return [
    head,
    { sql: 'DELETE FROM workout_sets WHERE workout_id = ?', params: [id] },
    ...workout.sets.map((set, position) => ({
      sql: `INSERT INTO workout_sets (id, workout_id, exercise_id, position, reps, weight_kg, duration_min, distance_km, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [newId(), id, set.exerciseId, position, set.reps, set.weightKg, set.durationMin, set.distanceKm, now],
    })),
  ];
}

export function deleteWorkoutStatement(id: string): Statement {
  return { sql: 'DELETE FROM workouts WHERE id = ?', params: [id] };
}

// ─── Revue de la semaine ────────────────────────────────────────────────────

/** Minutes des blocs faits de [from, to[, par mode ; et celles des blocs de sport (module Sport, ou icône haltère). */
export async function doneBlockMinutes(db: Db, from: string, to: string): Promise<{ work: number; school: number; sport: number }> {
  const rows = await db.query<{ mode: string; templateId: string | null; icon: string; startsAt: string; endsAt: string }>(
    "SELECT mode, template_id, icon, starts_at, ends_at FROM day_blocks WHERE status = 'done' AND date >= ? AND date < ?",
    [from, to],
  );
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const totals = { work: 0, school: 0, sport: 0 };
  for (const row of rows) {
    const duration = minutes(row.endsAt) - minutes(row.startsAt);
    if (isSportBlock(row)) totals.sport += duration;
    else if (row.mode === 'school') totals.school += duration;
    else if (row.mode === 'work') totals.work += duration;
  }
  return totals;
}

/** Tâches terminées entre deux horodatages : devoirs d'un côté, le reste de l'autre. */
export async function doneTaskCounts(db: Db, since: string, until: string): Promise<{ homework: number; tasks: number }> {
  const row = await db.queryOne<{ homework: number; tasks: number }>(
    `SELECT COALESCE(SUM(subject_id IS NOT NULL), 0) AS homework, COALESCE(SUM(subject_id IS NULL), 0) AS tasks
     FROM tasks WHERE status = 'done' AND parent_id IS NULL AND completed_at >= ? AND completed_at < ?`,
    [since, until],
  );
  return row ?? { homework: 0, tasks: 0 };
}

/** Encaissé (reçu) entre deux jours, [from, to[. */
export async function receivedCents(db: Db, from: string, to: string): Promise<number> {
  const row = await db.queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(amount_cents), 0) AS total FROM payments WHERE status = 'received' AND received_date >= ? AND received_date < ?",
    [from, to],
  );
  return row?.total ?? 0;
}
