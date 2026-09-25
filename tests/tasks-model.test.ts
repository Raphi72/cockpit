import { describe, expect, it } from 'vitest';
import {
  computeReorder,
  dayHeading,
  formatDuration,
  groupByProject,
  selectOverdue,
  selectPlannedOn,
  selectPriority,
  selectToday,
  selectUpcoming,
  sortOrderBetween,
  taskDateLabel,
  validateNewTask,
  type TaskItem,
} from '@/domains/tasks/model';

const TODAY = '2026-09-24'; // un jeudi

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
  ...overrides,
});

describe('vue Aujourd’hui', () => {
  it('prend les tâches prévues aujourd’hui, reportées, ou dues ; les retards à part', () => {
    const late = task({ title: 'retard', dueDate: '2026-09-23' });
    const scheduled = task({ title: 'prévue', scheduledDate: TODAY });
    const carried = task({ title: 'reportée', scheduledDate: '2026-09-20' });
    const dueToday = task({ title: 'due', dueDate: TODAY });
    const tomorrow = task({ title: 'demain', scheduledDate: '2026-09-25' });
    const noDate = task({ title: 'sans date' });
    const done = task({ title: 'faite', scheduledDate: TODAY, status: 'done' });

    const groups = selectToday([late, scheduled, carried, dueToday, tomorrow, noDate, done], TODAY);
    expect(groups.overdue.map((t) => t.title)).toEqual(['retard']);
    expect(groups.today.map((t) => t.title).sort()).toEqual(['due', 'prévue', 'reportée']);
  });

  it('met les plus prioritaires en tête', () => {
    const normal = task({ title: 'normale', scheduledDate: TODAY, sortOrder: 1 });
    const urgent = task({ title: 'urgente', scheduledDate: TODAY, priority: 3, sortOrder: 2 });
    expect(selectToday([normal, urgent], TODAY).today.map((t) => t.title)).toEqual(['urgente', 'normale']);
  });
});

describe('autres vues', () => {
  it('7 jours : groupe par jour, exclut aujourd’hui et au-delà de J+7', () => {
    const days = selectUpcoming(
      [
        task({ title: 'aujourd’hui', scheduledDate: TODAY }),
        task({ title: 'samedi', scheduledDate: '2026-09-26' }),
        task({ title: 'deadline samedi', dueDate: '2026-09-26' }),
        task({ title: 'J+7', scheduledDate: '2026-10-01' }),
        task({ title: 'J+8', scheduledDate: '2026-10-02' }),
      ],
      TODAY,
    );
    expect(days.map((d) => [d.date, d.tasks.length])).toEqual([
      ['2026-09-26', 2],
      ['2026-10-01', 1],
    ]);
  });

  it('un jour donné : ce qui y est prévu, sans reprendre ce qui est déjà dans Aujourd’hui', () => {
    const tasks = [
      task({ title: 'prévue samedi', scheduledDate: '2026-09-26' }),
      task({ title: 'deadline samedi', dueDate: '2026-09-26', priority: 3 }),
      task({ title: 'prévue samedi, deadline passée', scheduledDate: '2026-09-26', dueDate: '2026-09-20' }),
      task({ title: 'faite', scheduledDate: '2026-09-26', status: 'done' }),
      task({ title: 'pas faite hier', scheduledDate: '2026-09-23' }),
    ];
    // La plus prioritaire en tête ; la deadline dépassée est déjà dans Aujourd'hui (en retard).
    expect(selectPlannedOn(tasks, '2026-09-26', TODAY).map((t) => t.title)).toEqual(['deadline samedi', 'prévue samedi']);
    // Un jour passé : ce qui y était prévu et reste à faire.
    expect(selectPlannedOn(tasks, '2026-09-23', TODAY).map((t) => t.title)).toEqual(['pas faite hier']);
  });

  it('en retard, prioritaires, et regroupement par projet (tâches libres en dernier)', () => {
    const tasks = [
      task({ title: 'b', dueDate: '2026-09-22', priority: 2 }),
      task({ title: 'a', dueDate: '2026-09-20' }),
      task({ title: 'libre' }),
      task({ title: 'site', projectId: 'p1', projectName: 'Site vitrine', projectColor: 'blue', priority: 3 }),
    ];
    expect(selectOverdue(tasks, TODAY).map((t) => t.title)).toEqual(['a', 'b']);
    expect(selectPriority(tasks).map((t) => t.title)).toEqual(['site', 'b']);
    expect(groupByProject(tasks).map((g) => g.name)).toEqual(['Site vitrine', 'Sans projet']);
  });
});

describe('affichage', () => {
  it('la date affichée : deadline d’abord, colorée selon l’urgence', () => {
    expect(taskDateLabel(task({ dueDate: '2026-09-23' }), TODAY)).toMatchObject({
      kind: 'due',
      tone: 'late',
      label: 'En retard de 1 jour',
    });
    expect(taskDateLabel(task({ dueDate: '2026-09-25' }), TODAY)).toMatchObject({ tone: 'soon', label: 'Demain' });
    // Le début à venir, sans couleur.
    expect(taskDateLabel(task({ scheduledDate: '2026-09-28' }), TODAY)).toMatchObject({
      kind: 'scheduled',
      label: 'Dans 4 jours',
      tone: 'later',
    });
    expect(taskDateLabel(task({ scheduledDate: TODAY }), TODAY)).toBeNull();
    expect(taskDateLabel(task({ dueDate: '2026-09-20', status: 'done' }), TODAY)).toBeNull();
  });

  it('durées et titres de jour', () => {
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(90)).toBe('1 h 30');
    expect(formatDuration(120)).toBe('2 h');
    expect(dayHeading('2026-09-25', TODAY)).toBe('Demain');
    expect(dayHeading('2026-09-26', TODAY)).toBe('Samedi 26 sept.');
  });

  it('refuse une tâche sans titre', () => {
    const input = { title: ' ', projectId: null, scheduledDate: null, dueDate: null, priority: 1 as const, estimateMin: null, notes: null };
    expect(validateNewTask(input)).toEqual({ title: 'Donne un titre à la tâche.' });
  });
});

describe('ordre manuel', () => {
  const items = [
    { id: 'a', sortOrder: 1 },
    { id: 'b', sortOrder: 2 },
    { id: 'c', sortOrder: 3 },
  ];

  it('place l’élément entre ses nouveaux voisins en ne modifiant qu’une ligne', () => {
    expect(computeReorder(items, 2, 0)).toEqual([{ id: 'c', sortOrder: 0 }]);
    expect(computeReorder(items, 0, 1)).toEqual([{ id: 'a', sortOrder: 2.5 }]);
    expect(computeReorder(items, 0, 2)).toEqual([{ id: 'a', sortOrder: 4 }]);
    expect(computeReorder(items, 1, 1)).toEqual([]);
  });

  it('renumérote toute la liste quand deux ordres sont identiques', () => {
    const tied = [
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 1 },
    ];
    expect(computeReorder(tied, 2, 1)).toEqual([
      { id: 'a', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
      { id: 'b', sortOrder: 3 },
    ]);
    expect(sortOrderBetween(1, 1)).toBeUndefined();
  });
});
