import { describe, expect, it } from 'vitest';
import type { AgendaItem } from '@/domains/agenda/model';
import { homeworkForDay, schoolDaySummary, schoolUpcomingItems } from '@/domains/dashboard/school-model';
import type { TaskItem } from '@/domains/tasks/model';

const TODAY = '2026-11-26';

let n = 0;
const task = (patch: Partial<TaskItem>): TaskItem => ({
  id: `t${++n}`,
  projectId: null,
  projectName: null,
  projectColor: null,
  title: 'Devoir',
  notes: null,
  status: 'todo',
  priority: 1,
  scheduledDate: null,
  dueDate: null,
  estimateMin: null,
  sortOrder: n,
  completedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  parentId: null,
  parentTitle: null,
  subtasksTotal: 0,
  subtasksDone: 0,
  plannedOn: null,
  subjectId: 'maths',
  subjectName: 'Maths',
  subjectColor: 'blue',
  blockId: null,
  blockDate: null,
  ...patch,
});

const late = task({ id: 'late', dueDate: '2026-11-24' });
const tomorrow = task({ id: 'tomorrow', dueDate: '2026-11-27' });
const nextWeek = task({ id: 'nextWeek', dueDate: '2026-12-02' });
const farAway = task({ id: 'far', dueDate: '2026-12-20' });
const doToday = task({ id: 'doToday', scheduledDate: TODAY });
const someday = task({ id: 'someday' });
const work = task({ id: 'work', subjectId: null, subjectName: null, subjectColor: null, dueDate: '2026-11-27' });
const sub = task({ id: 'sub', parentId: 'tomorrow', dueDate: '2026-11-27' });
const all = [late, tomorrow, nextWeek, farAway, doToday, someday, work, sub];

describe('dashboard Cours', () => {
  it('montre les devoirs en retard, à rendre dans la semaine et à faire aujourd’hui', () => {
    expect(homeworkForDay(all, TODAY, TODAY).map((t) => t.id)).toEqual(['late', 'tomorrow', 'nextWeek', 'doToday']);
  });

  it('un autre jour : ce qui est à rendre dans la semaine qui suit, sans les retards', () => {
    expect(homeworkForDay(all, '2026-11-30', TODAY).map((t) => t.id)).toEqual(['nextWeek']);
    expect(homeworkForDay([...all, task({ id: 'planned', scheduledDate: '2026-11-30' })], '2026-11-30', TODAY).map((t) => t.id)).toEqual([
      'nextWeek',
      'planned',
    ]);
  });

  it('résume la journée', () => {
    const homework = homeworkForDay(all, TODAY, TODAY);
    expect(schoolDaySummary({ day: TODAY, today: TODAY, classes: 3, holidayName: null, homework })).toBe(
      '3 cours · 1 devoir à rendre demain · 1 en retard',
    );
    expect(schoolDaySummary({ day: TODAY, today: TODAY, classes: 0, holidayName: null, homework: [] })).toBe('Pas de cours');
    expect(schoolDaySummary({ day: TODAY, today: TODAY, classes: 0, holidayName: 'Vacances de Noël', homework: [] })).toBe(
      'Vacances de Noël : pas de cours',
    );
  });

  it('garde pour « Prochains jours » les prochains cours, les examens et les événements personnels', () => {
    const item = (source: AgendaItem['source'], projectId: string | null): AgendaItem => ({
      key: `${source}:${projectId}`,
      source,
      id: source,
      kind: source === 'exam' ? 'exam' : 'appointment',
      title: source,
      detail: null,
      start: TODAY,
      end: null,
      allDay: true,
      projectId,
      color: null,
      amountCents: null,
    });
    const course = (day: string): AgendaItem => ({ ...item('google', null), key: `cours:${day}`, kind: 'class', start: `${day}T09:00`, allDay: false, subjectId: 's1' });
    const kept = schoolUpcomingItems(
      [item('exam', null), item('event', null), item('event', 'p1'), item('payment', null), item('google', null), course(TODAY), course('2026-11-27')],
      TODAY,
    );
    // Les cours du jour affiché sont déjà dans « Cours du jour » ; ceux des jours suivants viennent ici.
    expect(kept.map((i) => i.key)).toEqual(['exam:null', 'event:null', 'google:null', 'cours:2026-11-27']);
    expect(schoolUpcomingItems([course(TODAY), course('2026-11-27')], '2026-11-27').map((i) => i.key)).toEqual([`cours:${TODAY}`]);
  });
});
