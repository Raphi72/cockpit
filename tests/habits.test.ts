import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { blockFromModule, type Module } from '@/domains/day/model';
import { deleteBlockStatement, insertBlockStatement } from '@/domains/day/repository';
import {
  doneDays,
  exerciseProgress,
  frequencyText,
  goalProgress,
  isScheduled,
  isSportBlock,
  isoWeekday,
  mondayOf,
  monthGrid,
  reviewSentence,
  sessionBest,
  setsSummary,
  streak,
  streakText,
  successRate,
  validateHabit,
  weekLabel,
  weekProgress,
  type Habit,
  type HabitInput,
  type Workout,
} from '@/domains/habits/model';
import {
  deleteGoalStatement,
  deleteWorkoutStatement,
  insertExerciseStatement,
  insertGoalStatement,
  insertHabitStatement,
  insertStepStatement,
  listGoals,
  listHabitLogs,
  listHabits,
  listWorkouts,
  saveWorkoutStatements,
  setHabitArchivedStatement,
  setHabitLogStatement,
  setStepDoneStatement,
} from '@/domains/habits/repository';
import { buildWeekReview } from '@/domains/habits/service';
import { habitNotices } from '@/domains/notifications/model';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
// Jeudi.
const TODAY = '2026-11-26';

const habitInput = (patch: Partial<HabitInput> = {}): HabitInput => ({
  name: 'Lire',
  icon: 'book',
  color: 'blue',
  frequency: 'daily',
  timesPerWeek: null,
  weekdays: [],
  reminderTime: null,
  moduleId: null,
  goalId: null,
  ...patch,
});

const habit = (patch: Partial<Habit> = {}): Habit => ({ id: 'h1', sortOrder: 1, ...habitInput(), ...patch });

const days = (...list: string[]) => new Set(list);

let counter = 0;
const nextId = () => `id-${++counter}`;

describe('habitudes : règles', () => {
  it('valide le nom, la fréquence et l’heure du rappel', () => {
    expect(validateHabit(habitInput())).toEqual({});
    expect(validateHabit(habitInput({ name: ' ' })).name).toBeDefined();
    expect(validateHabit(habitInput({ frequency: 'weekly', timesPerWeek: 0 })).frequency).toBeDefined();
    expect(validateHabit(habitInput({ frequency: 'days', weekdays: [] })).frequency).toBe('Choisis au moins un jour.');
    expect(validateHabit(habitInput({ reminderTime: '25:00' })).reminderTime).toBeDefined();
  });

  it('décrit la fréquence et compte les semaines du lundi', () => {
    expect(frequencyText(habit())).toBe('chaque jour');
    expect(frequencyText(habit({ frequency: 'weekly', timesPerWeek: 3 }))).toBe('3 fois par semaine');
    expect(frequencyText(habit({ frequency: 'days', weekdays: [5, 1, 3] }))).toBe('lun., mer., ven.');
    expect(isoWeekday(TODAY)).toBe(4);
    expect(isoWeekday('2026-11-29')).toBe(7);
    expect(mondayOf(TODAY)).toBe('2026-11-23');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
    expect(isScheduled(habit({ frequency: 'days', weekdays: [1, 3, 5] }), TODAY)).toBe(false);
    expect(isScheduled(habit({ frequency: 'weekly', timesPerWeek: 2 }), TODAY)).toBe(true);
  });

  it('coche une habitude par ses coches ou par un bloc fait de son module', () => {
    const logs = [
      { habitId: 'h1', day: '2026-11-24' },
      { habitId: 'h2', day: '2026-11-25' },
    ];
    const blocks = [
      { templateId: 'module-sport', date: '2026-11-25' },
      { templateId: 'module-devoirs', date: '2026-11-26' },
    ];
    expect([...doneDays(habit({ moduleId: 'module-sport' }), logs, blocks)].sort()).toEqual(['2026-11-24', '2026-11-25']);
    expect([...doneDays(habit(), logs, blocks)]).toEqual(['2026-11-24']);
  });

  it('compte la semaine et la série', () => {
    const daily = habit();
    expect(weekProgress(daily, days('2026-11-23', '2026-11-26', '2026-11-30'), TODAY)).toEqual({ done: 2, target: 7 });
    // Aujourd'hui pas encore fait : la série court jusqu'à hier.
    expect(streak(daily, days('2026-11-24', '2026-11-25'), TODAY)).toEqual({ count: 2, unit: 'jour' });
    expect(streak(daily, days('2026-11-24', '2026-11-25', TODAY), TODAY).count).toBe(3);
    expect(streak(daily, days('2026-11-24'), TODAY).count).toBe(0);
    // Certains jours : les jours non prévus ne cassent pas la série.
    const mwf = habit({ frequency: 'days', weekdays: [1, 3, 5] });
    expect(streak(mwf, days('2026-11-23', '2026-11-25', '2026-11-20'), TODAY).count).toBe(3);
    expect(streak(mwf, days('2026-11-23', '2026-11-25'), TODAY).count).toBe(2);
    // X fois par semaine : des semaines réussies d'affilée (la semaine en cours compte si elle l'est déjà).
    const twice = habit({ frequency: 'weekly', timesPerWeek: 2 });
    expect(streak(twice, days('2026-11-24', '2026-11-16', '2026-11-18', '2026-11-10', '2026-11-12'), TODAY)).toEqual({ count: 2, unit: 'semaine' });
    expect(streak(twice, days('2026-11-24', '2026-11-25', '2026-11-16', '2026-11-18'), TODAY).count).toBe(2);
    expect(streakText({ count: 0, unit: 'jour' })).toBeNull();
    expect(streakText({ count: 1, unit: 'jour' })).toBe('1 jour d’affilée');
    expect(streakText({ count: 3, unit: 'semaine' })).toBe('3 semaines d’affilée');
  });

  it('calcule le taux de réussite et la grille du mois', () => {
    const daily = habit();
    const done = new Set(Array.from({ length: 15 }, (_, i) => `2026-11-${String(26 - 2 * i).padStart(2, '0')}`).filter((d) => d >= '2026-10-28'));
    expect(successRate(daily, days(), TODAY)).toBe(0);
    expect(successRate(daily, days(TODAY), TODAY, 1)).toBe(1);
    expect(successRate(habit({ frequency: 'days', weekdays: [7] }), days('2026-11-22'), TODAY, 7)).toBe(1);
    expect(successRate(daily, done, TODAY, 2)).toBe(0.5);
    const grid = monthGrid(habit({ frequency: 'days', weekdays: [3] }), days('2026-11-04'), '2026-11', TODAY);
    expect(grid).toHaveLength(30);
    expect(grid.find((d) => d.day === '2026-11-04')?.state).toBe('done');
    expect(grid.find((d) => d.day === '2026-11-11')?.state).toBe('missed');
    expect(grid.find((d) => d.day === '2026-11-12')?.state).toBe('off');
    expect(grid.find((d) => d.day === '2026-11-27')?.state).toBe('future');
  });

  it('suit la progression d’un objectif par ses étapes', () => {
    const step = (id: string, doneAt: string | null) => ({ id, goalId: 'g', title: id, doneAt, sortOrder: 1 });
    expect(goalProgress({ steps: [], achievedAt: null })).toBeNull();
    expect(goalProgress({ steps: [step('a', NOW), step('b', null)], achievedAt: null })).toEqual({ done: 1, total: 2, ratio: 0.5 });
    expect(goalProgress({ steps: [step('a', null)], achievedAt: NOW })?.ratio).toBe(1);
  });

  it('résume une séance et la progression d’un exercice', () => {
    const set = (patch: Partial<Workout['sets'][number]>) => ({ exerciseId: 'squat', position: 0, reps: null, weightKg: null, durationMin: null, distanceKm: null, ...patch });
    const strength = [set({ reps: 10, weightKg: 40 }), set({ reps: 10, weightKg: 40 }), set({ reps: 8, weightKg: 45 })];
    expect(setsSummary(strength, 'strength')).toBe('2 × 10 × 40 kg, 8 × 45 kg');
    expect(setsSummary([set({ reps: 15 })], 'strength')).toBe('15 × poids du corps');
    expect(setsSummary([set({ durationMin: 30, distanceKm: 5.2 })], 'cardio')).toBe('30 min · 5,2 km');
    expect(sessionBest(strength, 'strength')).toBe(45);
    expect(sessionBest([set({ durationMin: 30 })], 'cardio')).toBe(30);
    expect(sessionBest([], 'strength')).toBeNull();
    // Sans charge (poids du corps) : le plus de répétitions.
    expect(sessionBest([set({ reps: 15 }), set({ reps: 18 })], 'strength')).toBe(18);
    const workouts: Workout[] = [
      { id: 'w2', blockId: null, date: '2026-11-20', feeling: 4, notes: null, sets: [set({ reps: 8, weightKg: 50 })] },
      { id: 'w1', blockId: null, date: '2026-11-13', feeling: 3, notes: null, sets: strength },
      { id: 'w3', blockId: null, date: '2026-11-24', feeling: null, notes: null, sets: [] },
    ];
    expect(exerciseProgress(workouts, { id: 'squat', name: 'Squat', kind: 'strength' })).toEqual([
      { date: '2026-11-13', value: 45 },
      { date: '2026-11-20', value: 50 },
    ]);
  });

  it('écrit une phrase de bilan et reconnaît un bloc de sport', () => {
    const review = { monday: '2026-11-23', workMinutes: 600, schoolMinutes: 0, sportMinutes: 90, habits: [{ name: 'Lire', done: 7, target: 7 }], homeworkDone: 0, tasksDone: 3, revenueCents: 0 };
    expect(reviewSentence(review)).toBe('Belle semaine : 10 h de travail, 1,5 h de sport, 1 habitude sur 1 tenue.');
    expect(reviewSentence({ ...review, habits: [{ name: 'Lire', done: 2, target: 7 }] })).toBe('Cette semaine : 10 h de travail, 1,5 h de sport, 0 habitude sur 1 tenue.');
    expect(reviewSentence({ ...review, workMinutes: 0, sportMinutes: 0, habits: [] })).toMatch(/^Une semaine sans/);
    expect(isSportBlock({ templateId: 'module-sport', icon: 'brain' })).toBe(true);
    expect(isSportBlock({ templateId: null, icon: 'dumbbell' })).toBe(true);
    expect(isSportBlock({ templateId: 'module-deepwork', icon: 'brain' })).toBe(false);
    expect(weekLabel('2026-11-23')).toBe('Semaine du 23 au 29 novembre');
    expect(weekLabel('2026-11-30')).toBe('Semaine du 30 novembre au 6 décembre');
  });

  it('rappelle une habitude attendue, une fois, à son heure', () => {
    const list = [
      { id: 'h1', name: 'Lire', reminderTime: '21:00', due: true },
      { id: 'h2', name: 'Méditer', reminderTime: '21:00', due: false },
      { id: 'h3', name: 'Marcher', reminderTime: null, due: true },
    ];
    expect(habitNotices(list, { today: TODAY, time: '20:59' })).toEqual([]);
    expect(habitNotices(list, { today: TODAY, time: '21:10' }).map((n) => [n.key, n.title])).toEqual([['habit:h1:2026-11-26', 'Habitude : Lire']]);
    expect(habitNotices(list, { today: TODAY, time: '21:30' })).toEqual([]);
  });
});

const sport: Module = { id: 'module-sport', name: 'Sport', icon: 'dumbbell', color: 'green', durationMin: 180, mode: 'both', sortOrder: 1 };
const deepWork: Module = { id: 'module-deepwork', name: 'Deep work', icon: 'brain', color: 'violet', durationMin: 120, mode: 'work', sortOrder: 3 };
const devoirs: Module = { id: 'module-devoirs', name: 'Devoirs', icon: 'notebook', color: 'blue', durationMin: 90, mode: 'school', sortOrder: 2 };

describe('habitudes : base', () => {
  it('enregistre, coche et archive une habitude', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertHabitStatement('h1', habitInput({ frequency: 'days', weekdays: [5, 1], reminderTime: '21:00', moduleId: 'module-sport' }), NOW),
      insertHabitStatement('h2', habitInput({ name: 'Méditer' }), NOW),
      setHabitLogStatement('h1', TODAY, true, NOW),
      // Cocher deux fois ne double rien.
      setHabitLogStatement('h1', TODAY, true, NOW),
      setHabitLogStatement('h2', '2026-11-25', true, NOW),
    ]);
    const habits = await listHabits(db);
    expect(habits.map((h) => [h.name, h.weekdays, h.reminderTime, h.moduleId, h.timesPerWeek])).toEqual([
      ['Lire', [1, 5], '21:00', 'module-sport', null],
      ['Méditer', [], null, null, null],
    ]);
    expect(await listHabitLogs(db, '2026-11-23', '2026-11-30')).toEqual([
      { habitId: 'h2', day: '2026-11-25' },
      { habitId: 'h1', day: TODAY },
    ]);
    await db.batch([setHabitLogStatement('h1', TODAY, false, NOW), setHabitArchivedStatement('h2', NOW, NOW)]);
    expect(await listHabitLogs(db, '2026-11-23', '2026-11-30')).toEqual([{ habitId: 'h2', day: '2026-11-25' }]);
    expect((await listHabits(db)).map((h) => h.name)).toEqual(['Lire']);
  });

  it('range les objectifs et leurs étapes ; supprimer un objectif garde ses habitudes', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertGoalStatement('g1', { title: 'Courir 10 km', dueDate: '2027-03-01', notes: null }, NOW),
      insertStepStatement('s1', 'g1', '5 km', NOW),
      insertStepStatement('s2', 'g1', '8 km', NOW),
      setStepDoneStatement('s1', NOW),
      insertHabitStatement('h1', habitInput({ name: 'Courir', goalId: 'g1' }), NOW),
    ]);
    const [goal] = await listGoals(db);
    expect(goal).toMatchObject({ title: 'Courir 10 km', dueDate: '2027-03-01', achievedAt: null });
    expect(goal!.steps.map((s) => [s.title, s.doneAt !== null])).toEqual([
      ['5 km', true],
      ['8 km', false],
    ]);
    await db.batch([deleteGoalStatement('g1')]);
    expect(await listGoals(db)).toEqual([]);
    expect(await db.query('SELECT id FROM goal_steps')).toEqual([]);
    expect((await listHabits(db))[0]).toMatchObject({ name: 'Courir', goalId: null });
  });

  it('note une séance, la modifie, garde la séance si son bloc disparaît', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertBlockStatement('b1', { ...blockFromModule(sport, TODAY, 17 * 60), status: 'done' }, NOW),
      insertExerciseStatement('squat', { name: 'Squat', kind: 'strength' }, NOW),
      insertExerciseStatement('run', { name: 'Course', kind: 'cardio' }, NOW),
      ...saveWorkoutStatements(
        'w1',
        {
          blockId: 'b1',
          date: TODAY,
          feeling: 4,
          notes: null,
          sets: [
            { exerciseId: 'squat', reps: 10, weightKg: 40, durationMin: null, distanceKm: null },
            { exerciseId: 'squat', reps: 8, weightKg: 42.5, durationMin: null, distanceKm: null },
            { exerciseId: 'run', reps: null, weightKg: null, durationMin: 20, distanceKm: 3.5 },
          ],
        },
        true,
        NOW,
        nextId,
      ),
    ]);
    let [workout] = await listWorkouts(db);
    expect(workout).toMatchObject({ id: 'w1', blockId: 'b1', feeling: 4 });
    expect(workout!.sets.map((s) => [s.exerciseId, s.position, s.reps, s.weightKg, s.distanceKm])).toEqual([
      ['squat', 0, 10, 40, null],
      ['squat', 1, 8, 42.5, null],
      ['run', 2, null, null, 3.5],
    ]);
    await db.batch(saveWorkoutStatements('w1', { blockId: 'b1', date: TODAY, feeling: 5, notes: 'Bien', sets: [{ exerciseId: 'run', reps: null, weightKg: null, durationMin: 25, distanceKm: 4 }] }, false, NOW, nextId));
    [workout] = await listWorkouts(db);
    expect(workout).toMatchObject({ feeling: 5, notes: 'Bien' });
    expect(workout!.sets).toHaveLength(1);
    await db.batch([deleteBlockStatement('b1')]);
    expect((await listWorkouts(db))[0]?.blockId).toBeNull();
    await db.batch([deleteWorkoutStatement('w1')]);
    expect(await db.query('SELECT id FROM workout_sets')).toEqual([]);
  });

  it('fait la revue d’une semaine à partir de ce qui est fait', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertBlockStatement('b-sport', { ...blockFromModule(sport, '2026-11-24', 17 * 60), endsAt: '18:30', status: 'done' }, NOW),
      insertBlockStatement('b-work', { ...blockFromModule(deepWork, '2026-11-25', 9 * 60), status: 'done' }, NOW),
      insertBlockStatement('b-school', { ...blockFromModule(devoirs, '2026-11-25', 18 * 60), status: 'done' }, NOW),
      // Prévu, pas fait : ne compte pas.
      insertBlockStatement('b-planned', blockFromModule(deepWork, '2026-11-26', 14 * 60), NOW),
      // La semaine d'avant : ne compte pas.
      insertBlockStatement('b-old', { ...blockFromModule(deepWork, '2026-11-20', 9 * 60), status: 'done' }, NOW),
      sql`INSERT INTO subjects (id, name, color, sort_order, created_at, updated_at) VALUES ('maths', 'Maths', 'blue', 1, ${NOW}, ${NOW})`,
      sql`INSERT INTO tasks (id, title, status, priority, sort_order, subject_id, completed_at, created_at, updated_at)
          VALUES ('t1', 'Exercices', 'done', 1, 1, 'maths', ${new Date('2026-11-24T18:00:00').toISOString()}, ${NOW}, ${NOW}),
                 ('t2', 'Maquette', 'done', 1, 2, NULL, ${new Date('2026-11-25T11:00:00').toISOString()}, ${NOW}, ${NOW}),
                 ('t3', 'Ancienne', 'done', 1, 3, NULL, ${new Date('2026-11-21T11:00:00').toISOString()}, ${NOW}, ${NOW})`,
      sql`INSERT INTO payments (id, label, amount_cents, due_date, status, received_date, created_at, updated_at)
          VALUES ('p1', 'Acompte', 50000, '2026-11-20', 'received', '2026-11-27', ${NOW}, ${NOW}),
                 ('p2', 'Solde', 90000, '2026-11-20', 'planned', NULL, ${NOW}, ${NOW})`,
      insertHabitStatement('h1', habitInput({ name: 'Sport', frequency: 'weekly', timesPerWeek: 2, moduleId: 'module-sport' }), NOW),
      setHabitLogStatement('h1', '2026-11-26', true, NOW),
      insertHabitStatement('h2', habitInput({ name: 'Lire' }), NOW),
    ]);
    const review = await buildWeekReview(db, '2026-11-23');
    expect(review).toEqual({
      monday: '2026-11-23',
      workMinutes: 120,
      schoolMinutes: 90,
      sportMinutes: 90,
      habits: [
        { name: 'Sport', done: 2, target: 2 },
        { name: 'Lire', done: 0, target: 7 },
      ],
      homeworkDone: 1,
      tasksDone: 1,
      revenueCents: 50000,
    });
  });
});
