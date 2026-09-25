import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { listProjectIdeas } from '@/domains/ideas/repository';
import {
  buildIdeaToTaskBatch,
  buildTaskToIdeaBatch,
  buildUndoTaskToIdeaBatch,
  canBecomeIdea,
} from '@/domains/ideas/service';
import {
  NEW_TASK_ID,
  keyboardDrop,
  placeInTree,
  projectTaskTree,
  type NewTaskInput,
  type TaskItem,
} from '@/domains/tasks/model';
import { getTask, insertTaskStatement, listProjectTasks, placeTaskStatements } from '@/domains/tasks/repository';
import { dropOnRow } from '@/domains/tasks/tree-dnd';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-25T10:00:00.000Z';

const item = (id: string, sortOrder: number, overrides: Partial<TaskItem> = {}): TaskItem => ({
  id,
  projectId: 'p1',
  projectName: 'Site vitrine',
  projectColor: 'blue',
  title: id,
  notes: null,
  status: 'todo',
  priority: 1,
  scheduledDate: null,
  dueDate: null,
  estimateMin: null,
  sortOrder,
  completedAt: null,
  createdAt: NOW,
  parentId: null,
  parentTitle: null,
  subtasksTotal: 0,
  subtasksDone: 0,
  ...overrides,
});

/** a, admin (› s1, s2), b */
const TASKS = [
  item('a', 1),
  item('admin', 2, { subtasksTotal: 2 }),
  item('s1', 3, { parentId: 'admin' }),
  item('s2', 4, { parentId: 'admin' }),
  item('b', 5),
];
const nodes = projectTaskTree(TASKS).open;
const moved = (id: string) => ({ id, hasSubtasks: TASKS.find((t) => t.id === id)!.subtasksTotal > 0 });

describe('glisser-déposer dans l’arbre des tâches', () => {
  it('avant ou après une tâche : entre ses voisines', () => {
    expect(placeInTree(nodes, moved('b'), { position: 'before', targetId: 'admin' })).toEqual({
      parentId: null,
      orders: [{ id: 'b', sortOrder: 1.5 }],
    });
    expect(placeInTree(nodes, moved('a'), { position: 'after', targetId: 'b' })).toEqual({
      parentId: null,
      orders: [{ id: 'a', sortOrder: 6 }],
    });
  });

  it('dans une tâche : elle devient sa dernière sous-tâche', () => {
    expect(placeInTree(nodes, moved('b'), { position: 'inside', targetId: 'admin' })).toEqual({
      parentId: 'admin',
      orders: [{ id: 'b', sortOrder: 5 }],
    });
    // Entre deux sous-tâches, ou sortie au premier niveau.
    expect(placeInTree(nodes, moved('a'), { position: 'after', targetId: 's1' })).toEqual({
      parentId: 'admin',
      orders: [{ id: 'a', sortOrder: 3.5 }],
    });
    expect(placeInTree(nodes, moved('s2'), { position: 'before', targetId: 'a' })).toEqual({
      parentId: null,
      orders: [{ id: 's2', sortOrder: 0 }],
    });
  });

  it('un seul niveau : rien dans une sous-tâche, et une tâche qui en a ne descend pas', () => {
    expect(placeInTree(nodes, moved('a'), { position: 'inside', targetId: 's1' })).toBeNull();
    expect(placeInTree(nodes, moved('admin'), { position: 'inside', targetId: 'b' })).toBeNull();
    expect(placeInTree(nodes, moved('admin'), { position: 'after', targetId: 's1' })).toBeNull();
    expect(placeInTree(nodes, moved('a'), { position: 'inside', targetId: 'a' })).toBeNull();
  });

  it('rien ne change : pas de déplacement', () => {
    expect(placeInTree(nodes, moved('a'), { position: 'before', targetId: 'admin' })).toBeNull();
    expect(placeInTree(nodes, moved('b'), { position: 'after', targetId: 'admin' })).toBeNull();
    expect(placeInTree(nodes, moved('b'), { position: 'end' })).toBeNull();
    expect(placeInTree(nodes, moved('s2'), { position: 'inside', targetId: 'admin' })).toBeNull();
  });

  it('une idée déposée devient une tâche à cette place', () => {
    expect(placeInTree(nodes, { id: NEW_TASK_ID, hasSubtasks: false }, { position: 'end' })).toEqual({
      parentId: null,
      orders: [{ id: NEW_TASK_ID, sortOrder: 6 }],
    });
  });

  it('renumérote les sœurs quand les ordres sont trop serrés', () => {
    const tight = projectTaskTree([item('x', 1), item('y', 1 + Number.EPSILON), item('z', 3)]).open;
    expect(placeInTree(tight, { id: 'z', hasSubtasks: false }, { position: 'before', targetId: 'y' })).toEqual({
      parentId: null,
      orders: [
        { id: 'x', sortOrder: 1 },
        { id: 'z', sortOrder: 2 },
        { id: 'y', sortOrder: 3 },
      ],
    });
  });

  it('la hauteur du pointeur choisit : haut avant, milieu dedans, bas après', () => {
    const task = { type: 'task' as const, task: TASKS.find((t) => t.id === 'b')! };
    expect(dropOnRow(nodes, task, 'admin', 0.1)).toEqual({ position: 'before', targetId: 'admin' });
    expect(dropOnRow(nodes, task, 'admin', 0.5)).toEqual({ position: 'inside', targetId: 'admin' });
    expect(dropOnRow(nodes, task, 'admin', 0.9)).toBeNull(); // b est déjà juste après admin
    // Au milieu d'une sous-tâche (pas de 3e niveau) : avant ou après selon la moitié.
    expect(dropOnRow(nodes, task, 's1', 0.45)).toEqual({ position: 'before', targetId: 's1' });
    expect(dropOnRow(nodes, task, 's1', 0.55)).toEqual({ position: 'after', targetId: 's1' });
  });

  it('au clavier : Alt + ↑ ↓ entre sœurs, → dans la tâche du dessus, ← hors de la parente', () => {
    expect(keyboardDrop(nodes, 'b', 'up')).toEqual({ position: 'before', targetId: 'admin' });
    expect(keyboardDrop(nodes, 'a', 'up')).toBeNull();
    expect(keyboardDrop(nodes, 's1', 'down')).toEqual({ position: 'after', targetId: 's2' });
    expect(keyboardDrop(nodes, 'b', 'indent')).toEqual({ position: 'inside', targetId: 'admin' });
    expect(keyboardDrop(nodes, 'a', 'indent')).toBeNull();
    expect(keyboardDrop(nodes, 's2', 'outdent')).toEqual({ position: 'after', targetId: 'admin' });
    expect(keyboardDrop(nodes, 'b', 'outdent')).toBeNull();
  });
});

const newTask = (overrides: Partial<NewTaskInput> = {}): NewTaskInput => ({
  title: 'Tâche',
  projectId: 'p1',
  scheduledDate: null,
  dueDate: null,
  priority: 1,
  estimateMin: null,
  notes: null,
  ...overrides,
});

async function seed() {
  const { db } = createTestDb();
  await db.batch([
    sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW})`,
    insertTaskStatement('a', newTask({ title: 'Maquette' }), NOW),
    insertTaskStatement('admin', newTask({ title: 'Tâches admin' }), NOW),
    insertTaskStatement('s1', newTask({ title: 'Devis', parentId: 'admin' }), NOW),
    sql`INSERT INTO ideas (id, project_id, title, created_at, updated_at) VALUES ('i1', 'p1', 'Mode sombre', ${NOW}, ${NOW})`,
  ]);
  return db;
}

describe('glisser-déposer : enregistrement', () => {
  it('une tâche rangée dans une autre en devient la sous-tâche, et en ressort', async () => {
    const db = await seed();
    const tree = projectTaskTree(await listProjectTasks(db, 'p1')).open;
    const a = (await getTask(db, 'a'))!;
    const inside = placeInTree(tree, { id: 'a', hasSubtasks: false }, { position: 'inside', targetId: 'admin' })!;
    await db.batch(placeTaskStatements('a', inside, a.parentId, NOW));
    expect(projectTaskTree(await listProjectTasks(db, 'p1')).open.map((n) => [n.task.id, n.children.map((c) => c.id)])).toEqual([
      ['admin', ['s1', 'a']],
    ]);

    const tree2 = projectTaskTree(await listProjectTasks(db, 'p1')).open;
    const out = placeInTree(tree2, { id: 'a', hasSubtasks: false }, { position: 'before', targetId: 'admin' })!;
    await db.batch(placeTaskStatements('a', out, 'admin', NOW));
    expect(projectTaskTree(await listProjectTasks(db, 'p1')).open.map((n) => n.task.id)).toEqual(['a', 'admin']);
    expect(await getTask(db, 'a')).toMatchObject({ parentId: null });
  });

  it('une idée déposée dans une tâche devient sa sous-tâche, et quitte les idées', async () => {
    const db = await seed();
    const tree = projectTaskTree(await listProjectTasks(db, 'p1')).open;
    const placement = placeInTree(tree, { id: NEW_TASK_ID, hasSubtasks: false }, { position: 'before', targetId: 's1' })!;
    const idea = { id: 'i1', projectId: 'p1', title: 'Mode sombre', createdAt: NOW };
    const { statements } = buildIdeaToTaskBatch(idea, { now: NOW, today: '2026-09-25', newId: () => 'k9' }, placement);
    await db.batch(statements);
    expect(await getTask(db, 'k9')).toMatchObject({ title: 'Mode sombre', parentId: 'admin', projectId: 'p1' });
    const children = projectTaskTree(await listProjectTasks(db, 'p1')).open.find((n) => n.task.id === 'admin')!.children;
    expect(children.map((c) => c.id)).toEqual(['k9', 's1']);
    expect(await listProjectIdeas(db, 'p1')).toEqual([]);
  });

  it('une tâche glissée dans les idées en devient une ; « Annuler » la remet à l’identique', async () => {
    const db = await seed();
    await db.batch([sql`UPDATE tasks SET due_date = '2026-10-01', notes = 'Voir le brief' WHERE id = 'a'`]);
    const a = (await getTask(db, 'a'))!;
    expect(canBecomeIdea(a)).toBe(true);
    expect(canBecomeIdea((await getTask(db, 'admin'))!)).toBe(false); // elle a une sous-tâche

    const { ideaId, statements } = buildTaskToIdeaBatch(a, { now: NOW, today: '2026-09-25', newId: () => 'i9' });
    await db.batch(statements);
    expect((await listProjectIdeas(db, 'p1')).map((i) => [i.id, i.title])).toEqual([
      ['i1', 'Mode sombre'],
      ['i9', 'Maquette'],
    ]);
    expect(await getTask(db, 'a')).toBeUndefined();

    await db.batch(buildUndoTaskToIdeaBatch(a, ideaId, NOW));
    expect(await getTask(db, 'a')).toMatchObject({ dueDate: '2026-10-01', notes: 'Voir le brief', sortOrder: a.sortOrder });
    expect((await listProjectIdeas(db, 'p1')).map((i) => i.id)).toEqual(['i1']);
  });
});
