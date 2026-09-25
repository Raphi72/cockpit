import { describe, expect, it } from 'vitest';
import type { AgendaItem } from '@/domains/agenda';
import {
  dashboardSummary,
  dashboardTitle,
  dayTasksHeading,
  nextTimedEvent,
  otherDaySummary,
  upcomingWithTasks,
} from '@/domains/dashboard/model';
import type { TaskItem } from '@/domains/tasks/model';

const TODAY = '2026-09-24';

const event = (overrides: Partial<AgendaItem>): AgendaItem => ({
  key: 'k',
  source: 'event',
  id: 'e1',
  kind: 'appointment',
  title: 'Point visio',
  detail: null,
  start: `${TODAY}T14:00`,
  end: null,
  allDay: false,
  projectId: null,
  color: null,
  amountCents: null,
  ...overrides,
});

describe('synthèse du dashboard', () => {
  it('annonce le prochain rendez-vous de la journée, pas encore commencé', () => {
    const items = [
      event({ key: 'matin', start: `${TODAY}T09:00` }),
      event({ key: 'réunion', kind: 'meeting', start: `${TODAY}T18:30` }),
      event({ key: 'rdv', start: `${TODAY}T14:00` }),
      event({ key: 'journée', allDay: true, start: TODAY }),
      event({ key: 'demain', start: '2026-09-25T08:00' }),
      event({ key: 'deadline', source: 'project', kind: 'project_deadline', allDay: true, start: TODAY }),
    ];
    expect(nextTimedEvent(items, TODAY, 10 * 60)?.key).toBe('rdv');
    expect(nextTimedEvent(items, TODAY, 14 * 60)?.key).toBe('rdv'); // commence maintenant
    expect(nextTimedEvent(items, TODAY, 15 * 60)?.key).toBe('réunion');
    expect(nextTimedEvent(items, TODAY, 19 * 60)).toBeNull();
  });

  it('résume les tâches du jour et le prochain rendez-vous', () => {
    expect(dashboardSummary({ todayCount: 5, overdueCount: 1, nextEvent: event({}) })).toBe(
      '5 tâches aujourd’hui, dont 1 en retard · rendez-vous à 14:00',
    );
    expect(dashboardSummary({ todayCount: 1, overdueCount: 0, nextEvent: null })).toBe('1 tâche aujourd’hui');
    expect(dashboardSummary({ todayCount: 0, overdueCount: 0, nextEvent: event({ kind: 'meeting' }) })).toBe(
      'réunion à 14:00',
    );
    expect(dashboardSummary({ todayCount: 0, overdueCount: 0, nextEvent: event({ kind: 'personal' }) })).toBe(
      'événement à 14:00',
    );
    expect(dashboardSummary({ todayCount: 0, overdueCount: 0, nextEvent: null })).toBe('Rien de prévu aujourd’hui.');
  });
});

describe('de jour en jour', () => {
  it('titre et intitulé du bloc de tâches', () => {
    expect(dashboardTitle('2026-09-26', TODAY)).toBe('Samedi 26 septembre');
    expect(dashboardTitle('2027-01-04', TODAY)).toBe('Lundi 4 janvier 2027');
    expect(dayTasksHeading(TODAY, TODAY)).toBe('Aujourd’hui');
    expect(dayTasksHeading('2026-09-25', TODAY)).toBe('Demain');
    expect(dayTasksHeading('2026-09-23', TODAY)).toBe('Hier');
    expect(dayTasksHeading('2026-09-28', TODAY)).toBe('Lundi 28 sept.');
  });

  it('résume un autre jour qu’aujourd’hui', () => {
    expect(otherDaySummary({ day: '2026-09-25', today: TODAY, planned: 3, done: 0 })).toBe('Demain · 3 tâches prévues');
    expect(otherDaySummary({ day: '2026-09-28', today: TODAY, planned: 0, done: 0 })).toBe('Dans 4 jours · rien de prévu');
    expect(otherDaySummary({ day: '2026-09-23', today: TODAY, planned: 1, done: 2 })).toBe(
      'Hier · 2 tâches terminées, 1 pas faite',
    );
    expect(otherDaySummary({ day: '2026-09-20', today: TODAY, planned: 0, done: 0 })).toBe('Il y a 4 jours · aucune tâche');
  });
});

describe('prochains jours', () => {
  const task = (overrides: Partial<TaskItem>): TaskItem => ({
    id: 't',
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
    sortOrder: 1,
    completedAt: null,
    createdAt: '2026-09-20T08:00:00.000Z',
    parentId: null,
    parentTitle: null,
    subtasksTotal: 0,
    subtasksDone: 0,
    ...overrides,
  });

  it('ajoute les tâches qui commencent à partir de demain, et ne garde que les jours qui ont quelque chose', () => {
    const agenda = [event({ key: 'rdv', start: '2026-09-26T10:00' })];
    const tasks = [
      task({ id: 'a', title: 'aujourd’hui', scheduledDate: TODAY }),
      task({ id: 'b', title: 'demain', scheduledDate: '2026-09-25' }),
      task({ id: 'c', title: 'samedi', scheduledDate: '2026-09-26', dueDate: '2026-09-29' }),
      task({ id: 'e', title: 'deadline seule', dueDate: '2026-09-27' }),
      task({ id: 'd', title: 'trop loin', scheduledDate: '2026-10-01' }),
    ];
    const days = upcomingWithTasks(agenda, tasks, TODAY);
    // « deadline seule » est dans À prévoir, pas ici.
    expect(days.map((d) => [d.day, d.items.map((i) => i.key), d.tasks.map((t) => t.title)])).toEqual([
      ['2026-09-25', [], ['demain']],
      ['2026-09-26', ['rdv'], ['samedi']],
    ]);
    // Samedi affiché dans le bloc de tâches : ses tâches n'y sont pas répétées.
    expect(upcomingWithTasks(agenda, tasks, TODAY, '2026-09-26').map((d) => [d.day, d.tasks.length])).toEqual([
      ['2026-09-25', 1],
      ['2026-09-26', 0],
    ]);
  });
});
