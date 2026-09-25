import { describe, expect, it } from 'vitest';
import { getProject, updateProjectStatement } from '@/domains/projects/repository';
import { buildCreateProjectBatch } from '@/domains/projects/service';
import type { NewTaskInput } from '@/domains/tasks/model';
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
} from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-24T10:00:00.000Z';

const newTask = (overrides: Partial<NewTaskInput> = {}): NewTaskInput => ({
  title: 'Tâche',
  projectId: null,
  scheduledDate: null,
  dueDate: null,
  priority: 1,
  estimateMin: null,
  notes: null,
  ...overrides,
});

async function setup() {
  const { db } = createTestDb();
  let n = 0;
  const ctx = { now: NOW, today: '2026-09-24', newId: () => `p${++n}` };
  const { projectId, statements } = buildCreateProjectBatch(
    {
      name: 'Site vitrine',
      typeId: 'type-freelance',
      client: { kind: 'none' },
      status: 'active',
      priority: 1,
      startDate: null,
      deadline: null,
      budgetCents: null,
      schedule: 'later',
      description: null,
    },
    ctx,
  );
  await db.batch(statements);
  return { db, projectId };
}

describe('tâches', () => {
  it('ajoute en fin de liste, séparément pour chaque projet et pour les tâches libres', async () => {
    const { db, projectId } = await setup();
    await db.batch([
      insertTaskStatement('a', newTask({ projectId }), NOW),
      insertTaskStatement('b', newTask({ projectId }), NOW),
      insertTaskStatement('libre', newTask(), NOW),
    ]);
    const tasks = await listProjectTasks(db, projectId);
    expect(tasks.map((t) => [t.id, t.sortOrder])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect((await getTask(db, 'libre'))?.sortOrder).toBe(1);
    expect(tasks[0]).toMatchObject({ projectName: 'Site vitrine', projectColor: 'blue', status: 'todo' });
  });

  it('terminer une tâche fait avancer la progression du projet', async () => {
    const { db, projectId } = await setup();
    await db.batch([
      insertTaskStatement('a', newTask({ projectId }), NOW),
      insertTaskStatement('b', newTask({ projectId }), NOW),
      updateTaskStatement('a', { status: 'done' }, NOW),
    ]);
    expect(await getTask(db, 'a')).toMatchObject({ status: 'done', completedAt: NOW });
    expect(await getProject(db, projectId, '2026-09-24')).toMatchObject({ tasksTotal: 2, tasksDone: 1 });

    await db.batch([updateTaskStatement('a', { status: 'todo' }, NOW)]);
    expect(await getTask(db, 'a')).toMatchObject({ status: 'todo', completedAt: null });
  });

  it('les vues globales ignorent les tâches terminées et celles des projets clos', async () => {
    const { db, projectId } = await setup();
    await db.batch([
      insertTaskStatement('ouverte', newTask({ projectId }), NOW),
      insertTaskStatement('faite', newTask(), NOW),
      updateTaskStatement('faite', { status: 'done' }, NOW),
      insertTaskStatement('libre', newTask(), NOW),
    ]);
    expect((await listOpenTasks(db)).map((t) => t.id).sort()).toEqual(['libre', 'ouverte']);
    expect((await listDoneTasks(db, { since: '2026-09-24T00:00:00.000Z' })).map((t) => t.id)).toEqual(['faite']);
    expect(await listDoneTasks(db, { since: '2026-09-25T00:00:00.000Z' })).toEqual([]);

    await db.batch([updateProjectStatement(projectId, { status: 'done' }, NOW)]);
    expect((await listOpenTasks(db)).map((t) => t.id)).toEqual(['libre']);
  });

  it('retrouve les tâches terminées un jour donné', async () => {
    const { db } = await setup();
    await db.batch([
      insertTaskStatement('a', newTask({ title: 'Mardi' }), NOW),
      insertTaskStatement('b', newTask({ title: 'Mercredi' }), NOW),
      updateTaskStatement('a', { status: 'done' }, '2026-09-22T15:00:00.000Z'),
      updateTaskStatement('b', { status: 'done' }, '2026-09-23T09:00:00.000Z'),
    ]);
    const done = await listDoneTasks(db, { since: '2026-09-22T00:00:00.000Z', until: '2026-09-23T00:00:00.000Z' });
    expect(done.map((t) => t.title)).toEqual(['Mardi']);
  });

  it('réordonne et restaure une tâche supprimée à l’identique', async () => {
    const { db, projectId } = await setup();
    await db.batch([
      insertTaskStatement('a', newTask({ projectId, notes: 'détails' }), NOW),
      insertTaskStatement('b', newTask({ projectId }), NOW),
      ...sortOrderStatements([{ id: 'b', sortOrder: 0.5 }], NOW),
    ]);
    expect((await listProjectTasks(db, projectId)).map((t) => t.id)).toEqual(['b', 'a']);

    const original = (await getTask(db, 'a'))!;
    await db.batch([deleteTaskStatement('a')]);
    expect(await getTask(db, 'a')).toBeUndefined();
    await db.batch([restoreTaskStatement(original, NOW)]);
    expect(await getTask(db, 'a')).toMatchObject({ notes: 'détails', sortOrder: original.sortOrder });
  });
});
