import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { isTaskForToday, selectToday, selectUpcoming, type NewTaskInput, type TaskItem } from '@/domains/tasks/model';
import {
  getTask,
  insertTaskStatement,
  listOpenTasks,
  listPlanState,
  savePlanStatements,
  setPlannedOnStatement,
  updateTaskStatements,
} from '@/domains/tasks/repository';
import {
  DEFAULT_PLAN_REQUEST,
  planCandidates,
  planTier,
  proposalSummary,
  proposePlan,
  rankForPlan,
  resolvePlanRequest,
  selectTodayPlan,
  stepDuration,
  type PlanRequest,
} from '@/domains/tasks/work-plan';
import { createTestDb, readMigrations } from './support/test-db';

const TODAY = '2026-09-26'; // un samedi
const NOW = '2026-09-26T08:00:00.000Z';

let n = 0;
const task = (overrides: Partial<TaskItem> = {}): TaskItem => ({
  id: `t${++n}`,
  projectId: null,
  projectName: null,
  projectColor: null,
  title: 'Tâche',
  notes: null,
  status: 'todo',
  priority: 1,
  scheduledDate: null,
  dueDate: null,
  estimateMin: null,
  sortOrder: n,
  completedAt: null,
  createdAt: '2026-09-20T08:00:00.000Z',
  parentId: null,
  parentTitle: null,
  subtasksTotal: 0,
  subtasksDone: 0,
  plannedOn: null,
  ...overrides,
});

const duration = (minutes: number): PlanRequest => ({ ...DEFAULT_PLAN_REQUEST, mode: 'duration', minutes });
const count = (value: number): PlanRequest => ({ ...DEFAULT_PLAN_REQUEST, mode: 'count', count: value });
const ids = (tasks: TaskItem[]) => tasks.map((t) => t.id);

describe('programme : quelles tâches', () => {
  it('ni les catégories (tâches qui ont des sous-tâches), ni les projets en pause', () => {
    const open = [
      task({ id: 'cat', subtasksTotal: 2 }),
      task({ id: 'sub', parentId: 'cat' }),
      task({ id: 'pause', projectId: 'p-pause' }),
      task({ id: 'libre' }),
      task({ id: 'projet', projectId: 'p1' }),
    ];
    expect(ids(planCandidates(open, new Set(['p-pause'])))).toEqual(['sub', 'libre', 'projet']);
  });
});

describe('programme : ordre de préférence', () => {
  it('les retards et ce qui est dû aujourd’hui, puis le prévu, le proche et l’urgent, puis le reste', () => {
    expect(planTier(task({ dueDate: '2026-09-20' }), TODAY)).toBe(0);
    expect(planTier(task({ dueDate: TODAY }), TODAY)).toBe(0);
    expect(planTier(task({ scheduledDate: '2026-09-25' }), TODAY)).toBe(1);
    expect(planTier(task({ dueDate: '2026-09-29' }), TODAY)).toBe(1);
    expect(planTier(task({ priority: 3 }), TODAY)).toBe(1);
    expect(planTier(task({ priority: 2 }), TODAY)).toBe(2);
    expect(planTier(task({ dueDate: '2026-10-03' }), TODAY)).toBe(2);
    expect(planTier(task({ dueDate: '2026-10-20' }), TODAY)).toBe(3);
    expect(planTier(task({ scheduledDate: '2026-10-06' }), TODAY)).toBe(3);
  });

  it('dans un palier : la deadline la plus proche, puis la priorité, puis l’ordre manuel', () => {
    const ranked = rankForPlan(
      [
        task({ id: 'loin', dueDate: '2026-10-20' }),
        task({ id: 'urgente', priority: 3 }),
        task({ id: 'haute', priority: 2 }),
        task({ id: 'semaine', dueDate: '2026-10-02' }),
        task({ id: 'retard', dueDate: '2026-09-22' }),
        task({ id: 'jour', scheduledDate: TODAY }),
        task({ id: 'rien' }),
      ],
      TODAY,
    );
    // « Urgente » rejoint le prévu du jour, et passe devant par sa priorité ; à palier égal, la deadline d'abord.
    expect(ids(ranked)).toEqual(['retard', 'urgente', 'jour', 'semaine', 'haute', 'loin', 'rien']);
  });
});

describe('programme : par durée', () => {
  it('ne dépasse jamais la durée : pour 2 h et deux tâches de 1 h 30, une seule', () => {
    const tasks = [task({ id: 'a', estimateMin: 90 }), task({ id: 'b', estimateMin: 90 })];
    const proposal = proposePlan(tasks, duration(120), TODAY);
    expect(ids(proposal.tasks)).toEqual(['a']);
    expect(proposal.minutes).toBe(90);
  });

  it('saute une tâche trop longue et comble avec une plus courte, plus loin', () => {
    const tasks = [
      task({ id: 'a', estimateMin: 60, dueDate: TODAY }),
      task({ id: 'long', estimateMin: 90, dueDate: '2026-09-28' }),
      task({ id: 'court', estimateMin: 30 }),
      task({ id: 'encore', estimateMin: 15 }),
    ];
    const proposal = proposePlan(tasks, duration(120), TODAY);
    expect(ids(proposal.tasks)).toEqual(['a', 'court', 'encore']);
    expect(proposal.minutes).toBe(105);
    expect(proposalSummary(proposal, duration(120))).toBe('1 h 45 sur 2 h');
  });

  it('laisse de côté les tâches sans estimation, et les compte', () => {
    const tasks = [task({ id: 'x', dueDate: TODAY }), task({ id: 'y' }), task({ id: 'a', estimateMin: 30 })];
    const proposal = proposePlan(tasks, duration(30), TODAY);
    expect(ids(proposal.tasks)).toEqual(['a']);
    expect(ids(proposal.unestimated)).toEqual(['x', 'y']);
  });

  it('écarte les tâches refusées (« Pas celle-ci ») : une autre prend la place', () => {
    const tasks = [task({ id: 'a', estimateMin: 60, dueDate: TODAY }), task({ id: 'b', estimateMin: 60 }), task({ id: 'c', estimateMin: 60 })];
    expect(ids(proposePlan(tasks, duration(60), TODAY, new Set(['a'])).tasks)).toEqual(['b']);
  });
});

describe('programme : par nombre', () => {
  it('prend les premières dans l’ordre de préférence, estimées ou non', () => {
    const tasks = [task({ id: 'rien' }), task({ id: 'retard', dueDate: '2026-09-24', estimateMin: 30 }), task({ id: 'urgente', priority: 3 })];
    const proposal = proposePlan(tasks, count(2), TODAY);
    expect(ids(proposal.tasks)).toEqual(['retard', 'urgente']);
    expect(proposalSummary(proposal, count(2))).toBe('2 tâches · ~30 min estimées');
    expect(proposalSummary(proposePlan([task()], count(3), TODAY), count(3))).toBe('1 tâche');
  });
});

describe('programme : réglages de la fenêtre', () => {
  it('ajuste la durée au quart d’heure, dans les bornes', () => {
    expect(stepDuration(120, 1)).toBe(135);
    expect(stepDuration(125, -1)).toBe(105);
    expect(stepDuration(15, -1)).toBe(15);
    expect(stepDuration(600, 1)).toBe(600);
  });

  it('retombe sur des valeurs sûres si le stockage local est abîmé', () => {
    expect(resolvePlanRequest(undefined)).toEqual(DEFAULT_PLAN_REQUEST);
    expect(resolvePlanRequest({ mode: 'count', minutes: 5000, count: 0 })).toEqual({ mode: 'count', minutes: 600, count: 1 });
    expect(resolvePlanRequest({ mode: 'autre', minutes: '2 h', count: 4 })).toEqual({ mode: 'duration', minutes: 120, count: 4 });
  });
});

describe('programme : dans Aujourd’hui, ce jour-là seulement', () => {
  const later = task({ id: 'later', scheduledDate: '2026-10-06', plannedOn: TODAY });

  const soon = task({ id: 'soon', scheduledDate: '2026-09-30', plannedOn: TODAY });

  it('une tâche au programme est dans Aujourd’hui, et plus dans les jours à venir', () => {
    expect(isTaskForToday(later, TODAY)).toBe(true);
    expect(selectToday([later], TODAY).today).toEqual([later]);
    expect(selectUpcoming([soon], TODAY)).toEqual([]);
  });

  it('le lendemain, elle retrouve sa place (ses dates n’ont pas changé)', () => {
    expect(isTaskForToday(later, '2026-09-27')).toBe(false);
    expect(selectUpcoming([soon], '2026-09-27').map((d) => d.date)).toEqual(['2026-09-30']);
  });

  it('le programme passe en tête, à part des retards et du reste', () => {
    const open = [
      task({ id: 'jour', scheduledDate: TODAY }),
      task({ id: 'retard', dueDate: '2026-09-20' }),
      task({ id: 'prog-retard', dueDate: '2026-09-21', plannedOn: TODAY }),
      later,
      task({ id: 'hier', plannedOn: '2026-09-25' }),
    ];
    const groups = selectTodayPlan(open, TODAY);
    expect(ids(groups.planned)).toEqual(['prog-retard', 'later']);
    expect(ids(groups.overdue)).toEqual(['retard']);
    expect(ids(groups.today)).toEqual(['jour']);
  });
});

describe('programme : en base', () => {
  const newTask = (overrides: Partial<NewTaskInput> = {}): NewTaskInput => ({
    title: 'Tâche',
    projectId: null,
    scheduledDate: null,
    dueDate: null,
    priority: 1,
    estimateMin: 30,
    notes: null,
    ...overrides,
  });

  async function setup() {
    const { db } = createTestDb();
    await db.batch([
      insertTaskStatement('a', newTask({ scheduledDate: '2026-10-06' }), NOW),
      insertTaskStatement('b', newTask(), NOW),
      insertTaskStatement('c', newTask(), NOW),
      insertTaskStatement('d', newTask(), NOW),
    ]);
    return db;
  }

  it('met les tâches au programme sans toucher à leurs dates, et remplace le programme d’avant', async () => {
    const db = await setup();
    await db.batch(savePlanStatements(TODAY, ['a', 'b'], NOW));
    await db.batch(updateTaskStatements('b', { status: 'done' }, NOW));
    await db.batch(savePlanStatements(TODAY, ['c'], NOW));

    const a = await getTask(db, 'a');
    expect([a?.plannedOn, a?.scheduledDate]).toEqual([null, '2026-10-06']);
    // Terminée : elle garde le programme du jour (le bilan).
    expect((await getTask(db, 'b'))?.plannedOn).toBe(TODAY);
    expect((await getTask(db, 'c'))?.plannedOn).toBe(TODAY);
    expect((await listOpenTasks(db)).filter((t) => isTaskForToday(t, TODAY)).map((t) => t.id)).toEqual(['c']);
  });

  it('« Annuler » remet le programme d’avant', async () => {
    const db = await setup();
    await db.batch(savePlanStatements(TODAY, ['a', 'b'], NOW));
    const before = await listPlanState(db, TODAY, ['c', 'd']);
    expect(before.map((t) => [t.id, t.plannedOn]).sort()).toEqual([
      ['a', TODAY],
      ['b', TODAY],
      ['c', null],
      ['d', null],
    ]);
    await db.batch(savePlanStatements(TODAY, ['c', 'd'], NOW));
    await db.batch(before.map((t) => setPlannedOnStatement(t.id, t.plannedOn, NOW)));
    const planned = (await listOpenTasks(db)).filter((t) => t.plannedOn === TODAY).map((t) => t.id);
    expect(planned.sort()).toEqual(['a', 'b']);
  });

  it('un programme vide efface celui du jour', async () => {
    const db = await setup();
    await db.batch(savePlanStatements(TODAY, ['a'], NOW));
    await db.batch(savePlanStatements(TODAY, [], NOW));
    expect((await getTask(db, 'a'))?.plannedOn).toBeNull();
  });

  it('la migration ajoute la colonne à une base existante, sans programme', async () => {
    const { db, raw } = createTestDb({ migrations: 4 });
    await db.batch([sql`INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES ('x', 'Vieille', 1, ${NOW}, ${NOW})`]);
    raw.exec(readMigrations()[4]!);
    expect((await getTask(db, 'x'))?.plannedOn).toBeNull();
  });
});
