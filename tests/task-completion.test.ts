import { afterEach, describe, expect, it, vi } from 'vitest';
import { sql } from '@/core/db/client';
import { cancelCompleting, isCompleting, startCompleting, useCompletingTasks } from '@/domains/tasks/completion-store';
import {
  IDLE_ROW,
  completeInList,
  projectTaskTree,
  rowCompletion,
  treeCompletion,
  type NewTaskInput,
  type TaskItem,
} from '@/domains/tasks/model';
import {
  getTask,
  insertTaskStatement,
  listTasksAround,
  restoreTaskStatusStatement,
  updateTaskStatements,
} from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-26T10:00:00.000Z';

let n = 0;
const task = (overrides: Partial<TaskItem> = {}): TaskItem => ({
  id: `t${++n}`,
  projectId: 'p1',
  projectName: 'Site vitrine',
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

describe('terminer une tâche : lignes pendant l’animation', () => {
  const parent = task({ id: 'admin', subtasksTotal: 2 });
  const child = task({ id: 'refonte', parentId: 'admin' });

  it('rien en cours : ligne ordinaire', () => {
    expect(rowCompletion(child, [])).toBe(IDLE_ROW);
  });

  it('cochée : la ligne s’efface, sauf dans une liste qui garde les terminées', () => {
    expect(rowCompletion(child, ['refonte'])).toEqual({ checked: true, leaving: true });
    expect(rowCompletion(child, ['refonte'], false)).toEqual({ checked: true, leaving: false });
  });

  it('une sous-tâche part avec sa parente', () => {
    expect(rowCompletion(child, ['admin'], false)).toEqual({ checked: true, leaving: true });
    expect(rowCompletion(parent, ['refonte'])).toBe(IDLE_ROW);
  });
});

describe('terminer une tâche : arbre d’un projet', () => {
  const tree = () => {
    const tasks = [
      task({ id: 'admin', subtasksTotal: 3, subtasksDone: 1 }),
      task({ id: 'refonte', parentId: 'admin' }),
      task({ id: 'graphs', parentId: 'admin' }),
      task({ id: 'logo', parentId: 'admin', status: 'done' }),
      task({ id: 'seule' }),
    ];
    return projectTaskTree(tasks).open;
  };

  it('une sous-tâche cochée reste sous sa parente, barrée', () => {
    const rows = treeCompletion(tree(), ['refonte']);
    expect(rows.get('refonte')).toEqual({ checked: true, leaving: false });
    expect(rows.has('admin')).toBe(false);
  });

  it('cocher la parente efface tout son groupe', () => {
    const rows = treeCompletion(tree(), ['admin']);
    expect(rows.get('admin')).toEqual({ checked: true, leaving: true });
    expect(rows.get('refonte')).toEqual({ checked: true, leaving: true });
    // Déjà terminée : déjà barrée, elle part avec les autres.
    expect(rows.get('logo')).toEqual({ checked: false, leaving: true });
    expect(rows.has('seule')).toBe(false);
  });

  it('cocher la dernière sous-tâche ouverte termine la parente : le groupe s’efface', () => {
    const rows = treeCompletion(tree(), ['refonte', 'graphs']);
    expect(rows.get('admin')).toEqual({ checked: true, leaving: true });
    expect(rows.get('graphs')).toEqual({ checked: true, leaving: true });
  });

  it('une tâche simple s’efface seule', () => {
    const rows = treeCompletion(tree(), ['seule']);
    expect([...rows.keys()]).toEqual(['seule']);
    expect(rows.get('seule')).toEqual({ checked: true, leaving: true });
  });
});

describe('terminer une tâche : listes en cache', () => {
  it('la tâche et ses sous-tâches sont terminées', () => {
    const list = [task({ id: 'admin' }), task({ id: 'a', parentId: 'admin' }), task({ id: 'b' })];
    const next = completeInList(list, 'admin', NOW);
    expect(next.map((t) => t.status)).toEqual(['done', 'done', 'todo']);
    expect(next[0]!.completedAt).toBe(NOW);
  });

  it('la parente aussi, quand c’était sa dernière sous-tâche ouverte', () => {
    const list = [
      task({ id: 'admin' }),
      task({ id: 'a', parentId: 'admin', status: 'done' }),
      task({ id: 'b', parentId: 'admin' }),
    ];
    expect(completeInList(list, 'b', NOW).map((t) => t.status)).toEqual(['done', 'done', 'done']);
    const open = [task({ id: 'admin' }), task({ id: 'b', parentId: 'admin' }), task({ id: 'c', parentId: 'admin' })];
    expect(completeInList(open, 'b', NOW).map((t) => t.status)).toEqual(['todo', 'done', 'todo']);
  });

  it('une tâche absente de la liste ne change rien, sauf ses sous-tâches', () => {
    const subtasks = [task({ id: 'a', parentId: 'admin' })];
    expect(completeInList(subtasks, 'admin', NOW)[0]!.status).toBe('done');
    expect(completeInList(subtasks, 'autre', NOW)).toEqual(subtasks);
  });
});

describe('terminer une tâche : minuteur', () => {
  afterEach(() => vi.useRealTimers());

  it('enregistre à la fin de l’animation, puis libère la ligne', async () => {
    vi.useFakeTimers();
    const commit = vi.fn(async () => {});
    startCompleting('x', 1100, commit);
    expect(useCompletingTasks.getState().ids).toEqual(['x']);
    expect(isCompleting('x')).toBe(true);
    vi.advanceTimersByTime(1099);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(useCompletingTasks.getState().ids).toEqual([]);
  });

  it('recocher pendant l’animation annule tout', () => {
    vi.useFakeTimers();
    const commit = vi.fn(async () => {});
    startCompleting('y', 1100, commit);
    cancelCompleting('y');
    vi.advanceTimersByTime(2000);
    expect(commit).not.toHaveBeenCalled();
    expect(useCompletingTasks.getState().ids).toEqual([]);
    expect(isCompleting('y')).toBe(false);
  });
});

describe('terminer une tâche : « Annuler »', () => {
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

  it('remet la tâche, sa parente et ses sœurs comme avant', async () => {
    const { db } = createTestDb();
    await db.batch([
      sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
          VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW})`,
      insertTaskStatement('admin', newTask({ title: 'Tâches admin' }), NOW),
      insertTaskStatement('refonte', newTask({ parentId: 'admin' }), NOW),
      insertTaskStatement('graphs', newTask({ parentId: 'admin' }), NOW),
    ]);
    await db.batch(updateTaskStatements('graphs', { status: 'in_progress' }, NOW));
    await db.batch(updateTaskStatements('refonte', { status: 'done' }, NOW));

    // Cocher la dernière sous-tâche ouverte termine la parente.
    const before = await listTasksAround(db, ['graphs']);
    await db.batch(updateTaskStatements('graphs', { status: 'done' }, NOW));
    expect((await getTask(db, 'admin'))?.status).toBe('done');

    await db.batch(before.map((t) => restoreTaskStatusStatement(t, NOW)));
    expect((await getTask(db, 'graphs'))?.status).toBe('in_progress');
    expect((await getTask(db, 'admin'))?.status).toBe('todo');
    expect((await getTask(db, 'refonte'))?.status).toBe('done');
    expect((await getTask(db, 'graphs'))?.completedAt).toBeNull();
  });
});
