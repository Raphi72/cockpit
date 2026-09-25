import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { getProject } from '@/domains/projects/repository';
import { buildRestoreProjectBatch, deleteProject } from '@/domains/projects/service';
import {
  canBeParentOf,
  leafProgress,
  nestTasks,
  projectTaskTree,
  type NewTaskInput,
  type TaskItem,
} from '@/domains/tasks/model';
import {
  deleteTaskStatement,
  getTask,
  insertTaskStatement,
  listProjectTasks,
  listSubtasks,
  listTasksAround,
  restoreTaskFieldsStatement,
  restoreTaskStatement,
  updateTaskStatements,
} from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-25T10:00:00.000Z';

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

/** Deux projets ; dans p1 : « Tâches admin » et ses deux sous-tâches, plus une tâche simple. */
async function setup() {
  const { db } = createTestDb();
  await db.batch([
    sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW}),
               ('p2', 'Appli mobile', 'type-freelance', 'active', ${NOW}, ${NOW})`,
    insertTaskStatement('admin', newTask({ title: 'Tâches admin', projectId: 'p1' }), NOW),
    insertTaskStatement('seule', newTask({ title: 'Envoyer la maquette', projectId: 'p1' }), NOW),
    // Sans projet indiqué : elle prend celui de sa parente.
    insertTaskStatement('refonte', newTask({ title: 'Faire la refonte graphique', parentId: 'admin' }), NOW),
    insertTaskStatement('graphs', newTask({ title: 'Ajout de graphiques', parentId: 'admin' }), NOW),
  ]);
  return db;
}

const status = async (db: Awaited<ReturnType<typeof setup>>, id: string) => (await getTask(db, id))?.status;

describe('sous-tâches : enregistrement', () => {
  it('rejoignent le projet de leur parente, après leurs sœurs', async () => {
    const db = await setup();
    const subtasks = await listSubtasks(db, 'admin');
    expect(subtasks.map((t) => [t.title, t.projectId, t.parentTitle])).toEqual([
      ['Faire la refonte graphique', 'p1', 'Tâches admin'],
      ['Ajout de graphiques', 'p1', 'Tâches admin'],
    ]);
    expect(await getTask(db, 'admin')).toMatchObject({ subtasksTotal: 2, subtasksDone: 0, parentId: null });
  });

  it('la progression du projet compte les sous-tâches, pas la tâche qui les regroupe', async () => {
    const db = await setup();
    expect(await getProject(db, 'p1')).toMatchObject({ tasksTotal: 3, tasksDone: 0 });
    await db.batch(updateTaskStatements('refonte', { status: 'done' }, NOW));
    expect(await getProject(db, 'p1')).toMatchObject({ tasksTotal: 3, tasksDone: 1 });
  });
});

describe('sous-tâches : cocher', () => {
  it('terminer la dernière sous-tâche termine la parente ; en rouvrir une la rouvre', async () => {
    const db = await setup();
    await db.batch(updateTaskStatements('refonte', { status: 'done' }, NOW));
    expect(await status(db, 'admin')).toBe('todo');
    await db.batch(updateTaskStatements('graphs', { status: 'done' }, NOW));
    expect(await status(db, 'admin')).toBe('done');
    expect((await getTask(db, 'admin'))?.completedAt).toBe(NOW);

    await db.batch(updateTaskStatements('graphs', { status: 'todo' }, NOW));
    expect(await status(db, 'admin')).toBe('todo');
    expect(await status(db, 'refonte')).toBe('done');
  });

  it('terminer la parente termine ses sous-tâches ouvertes', async () => {
    const db = await setup();
    await db.batch(updateTaskStatements('admin', { status: 'done' }, NOW));
    expect((await listSubtasks(db, 'admin')).map((t) => t.status)).toEqual(['done', 'done']);
  });
});

describe('sous-tâches : déplacer', () => {
  it('la parente change de projet : ses sous-tâches suivent', async () => {
    const db = await setup();
    await db.batch(updateTaskStatements('admin', { projectId: 'p2' }, NOW));
    expect((await listSubtasks(db, 'admin')).map((t) => t.projectId)).toEqual(['p2', 'p2']);
  });

  it('une sous-tâche qui change de projet quitte sa parente', async () => {
    const db = await setup();
    await db.batch(updateTaskStatements('graphs', { projectId: 'p2' }, NOW));
    expect(await getTask(db, 'graphs')).toMatchObject({ projectId: 'p2', parentId: null });
    expect(await getTask(db, 'refonte')).toMatchObject({ parentId: 'admin' });
  });

  it('devenir sous-tâche : on rejoint le projet de la parente, rouverte si besoin', async () => {
    const db = await setup();
    await db.batch([
      insertTaskStatement('libre', newTask({ title: 'Relancer le comptable' }), NOW),
      ...updateTaskStatements('admin', { status: 'done' }, NOW),
    ]);
    await db.batch(updateTaskStatements('libre', { parentId: 'admin' }, NOW));
    expect(await getTask(db, 'libre')).toMatchObject({ projectId: 'p1', parentId: 'admin' });
    expect(await status(db, 'admin')).toBe('todo');
    // Après ses nouvelles sœurs.
    expect((await listSubtasks(db, 'admin')).map((t) => t.id)).toEqual(['refonte', 'graphs', 'libre']);

    await db.batch(updateTaskStatements('libre', { parentId: null }, NOW));
    expect(await getTask(db, 'libre')).toMatchObject({ projectId: 'p1', parentId: null });
  });
});

describe('sous-tâches : supprimer', () => {
  it('supprimer la parente supprime ses sous-tâches ; « Annuler » ramène tout', async () => {
    const db = await setup();
    const parent = (await getTask(db, 'admin'))!;
    const subtasks = await listSubtasks(db, 'admin');
    await db.batch([deleteTaskStatement('admin')]);
    expect((await listProjectTasks(db, 'p1')).map((t) => t.id)).toEqual(['seule']);

    await db.batch([parent, ...subtasks].map((t) => restoreTaskStatement(t, NOW)));
    expect((await listSubtasks(db, 'admin')).map((t) => t.id)).toEqual(['refonte', 'graphs']);
  });

  it('le projet revient avec ses sous-tâches, même si une sous-tâche passe avant sa parente', async () => {
    const db = await setup();
    // La parente est déplacée en fin de liste : l'ordre ne suffit plus pour la réinsérer d'abord.
    await db.batch([sql`UPDATE tasks SET sort_order = 99 WHERE id = 'admin'`]);
    const result = await deleteProject(db, 'p1');
    if (result.status !== 'deleted') throw new Error('projet non supprimé');
    await db.batch(buildRestoreProjectBatch(result.snapshot, NOW));
    expect((await listSubtasks(db, 'admin')).map((t) => t.id)).toEqual(['refonte', 'graphs']);
  });
});

describe('actions groupées', () => {
  it('même changement sur plusieurs tâches, puis « Annuler » remet tout, cascades comprises', async () => {
    const db = await setup();
    const ids = ['seule', 'graphs'];
    const before = await listTasksAround(db, ids);
    // Les choisies, et la parente de « graphs » (qu'une action peut terminer ou rouvrir).
    expect(before.map((t) => t.id).sort()).toEqual(['admin', 'graphs', 'seule']);

    await db.batch([
      ...updateTaskStatements('refonte', { status: 'done' }, NOW),
      ...ids.flatMap((id) => updateTaskStatements(id, { status: 'done', dueDate: '2026-10-01' }, NOW)),
    ]);
    expect(await status(db, 'admin')).toBe('done'); // dernière sous-tâche terminée

    const snapshot = await listTasksAround(db, ['seule', 'graphs']);
    expect(snapshot.find((t) => t.id === 'seule')).toMatchObject({ status: 'done', dueDate: '2026-10-01' });
    await db.batch(before.map((t) => restoreTaskFieldsStatement(t, NOW)));
    expect(await getTask(db, 'seule')).toMatchObject({ status: 'todo', dueDate: null, completedAt: null });
    expect(await status(db, 'admin')).toBe('todo');
  });
});

describe('sous-tâches : règles d’affichage', () => {
  const item = (id: string, overrides: Partial<TaskItem> = {}): TaskItem => ({
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
    sortOrder: 1,
    completedAt: null,
    createdAt: NOW,
    parentId: null,
    parentTitle: null,
    subtasksTotal: 0,
    subtasksDone: 0,
    ...overrides,
  });

  it('un seul niveau, dans le même projet', () => {
    const admin = item('admin', { subtasksTotal: 2 });
    const refonte = item('refonte', { parentId: 'admin' });
    const seule = item('seule');
    expect(canBeParentOf(admin, seule)).toBe(true);
    expect(canBeParentOf(refonte, seule)).toBe(false); // une sous-tâche ne peut pas en avoir
    expect(canBeParentOf(seule, admin)).toBe(false); // une tâche qui a des sous-tâches ne descend pas
    expect(canBeParentOf(seule, seule)).toBe(false);
    expect(canBeParentOf(item('ailleurs', { projectId: 'p2' }), seule)).toBe(false);
  });

  it('range les sous-tâches sous leur parente', () => {
    const tasks = [
      item('graphs', { parentId: 'admin', sortOrder: 4 }),
      item('admin', { sortOrder: 3, subtasksTotal: 2, subtasksDone: 1 }),
      item('refonte', { parentId: 'admin', sortOrder: 5, status: 'done' }),
      item('seule', { sortOrder: 1 }),
      item('faite', { sortOrder: 2, status: 'done' }),
    ];
    const tree = projectTaskTree(tasks);
    expect(tree.open.map((n) => [n.task.id, n.children.map((c) => c.id)])).toEqual([
      ['seule', []],
      ['admin', ['graphs', 'refonte']],
    ]);
    expect(tree.done.map((t) => t.id)).toEqual(['faite']);
    expect(leafProgress(tasks)).toEqual({ done: 2, total: 4 });

    // Liste à plat : la sous-tâche passe sous sa parente si elle est là, sinon reste seule.
    expect(nestTasks([tasks[0]!, tasks[3]!, tasks[1]!]).map((r) => [r.task.id, r.depth])).toEqual([
      ['seule', 0],
      ['admin', 0],
      ['graphs', 1],
    ]);
    expect(nestTasks([tasks[0]!]).map((r) => [r.task.id, r.depth])).toEqual([['graphs', 0]]);
  });
});
