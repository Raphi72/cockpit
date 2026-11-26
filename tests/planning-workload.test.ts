import { describe, expect, it } from 'vitest';
import { planningPeriod } from '@/domains/agenda/timeline/model';
import {
  displayMinutes,
  isWeekShort,
  isWorkTime,
  projectWeekMinutes,
  spreadTasks,
  weekShortage,
  weeklyWorkload,
  type LoadBlock,
  type LoadProject,
  type LoadTask,
} from '@/domains/agenda/timeline/workload';

const TODAY = '2026-09-25'; // un vendredi ; la période du zoom mois va du lundi 14 septembre au dimanche 25 octobre
const PERIOD = planningPeriod('month', TODAY);

const task = (id: string, overrides: Partial<LoadTask> = {}): LoadTask => ({
  id,
  projectId: null,
  projectName: null,
  subjectId: null,
  status: 'todo',
  subtasksTotal: 0,
  scheduledDate: null,
  dueDate: null,
  estimateMin: 60,
  blockDate: null,
  ...overrides,
});

const block = (date: string, startsAt: string, endsAt: string, overrides: Partial<LoadBlock> = {}): LoadBlock => ({
  date,
  startsAt,
  endsAt,
  mode: 'work',
  status: 'planned',
  ...overrides,
});

const PROJECTS: LoadProject[] = [
  { id: 'site', startDate: '2026-09-01', deadline: '2026-10-04' },
  { id: 'appli', startDate: '2026-10-05', deadline: '2026-10-18' },
];

describe('tâches comptées dans la charge', () => {
  it('garde les tâches à faire du mode Travail, sans sous-tâches, sans projet ou d’un projet du planning', () => {
    const { spreads } = spreadTasks(
      [
        task('ok', { dueDate: '2026-09-30' }),
        task('faite', { dueDate: '2026-09-30', status: 'done' }),
        task('devoir', { dueDate: '2026-09-30', subjectId: 'maths' }),
        task('categorie', { dueDate: '2026-09-30', subtasksTotal: 2 }),
        task('en-pause', { dueDate: '2026-09-30', projectId: 'pause' }),
        task('site', { projectId: 'site' }),
      ],
      PROJECTS,
      TODAY,
    );
    expect(spreads.map((s) => s.task.id)).toEqual(['ok', 'site']);
  });

  it('répartit une tâche d’aujourd’hui à sa deadline, ou à celle de son projet', () => {
    const { spreads } = spreadTasks(
      [task('propre', { dueDate: '2026-10-01', estimateMin: 120 }), task('du-projet', { projectId: 'site' })],
      PROJECTS,
      TODAY,
    );
    expect(spreads.map((s) => [s.task.id, s.from, s.to, s.minutes])).toEqual([
      ['propre', TODAY, '2026-10-01', 120],
      ['du-projet', TODAY, '2026-10-04', 60],
    ]);
  });

  it('commence au début de la tâche, ou à celui d’un projet à venir', () => {
    const { spreads } = spreadTasks(
      [
        task('debut', { dueDate: '2026-10-10', scheduledDate: '2026-10-01' }),
        task('debut-passe', { dueDate: '2026-10-10', scheduledDate: '2026-09-01' }),
        task('appli', { projectId: 'appli' }),
        task('apres-la-deadline', { dueDate: '2026-10-02', scheduledDate: '2026-10-08' }),
      ],
      PROJECTS,
      TODAY,
    );
    expect(spreads.map((s) => [s.task.id, s.from, s.to])).toEqual([
      ['debut', '2026-10-01', '2026-10-10'],
      ['debut-passe', TODAY, '2026-10-10'],
      ['appli', '2026-10-05', '2026-10-18'],
      ['apres-la-deadline', '2026-10-02', '2026-10-02'],
    ]);
  });

  it('compte une tâche en retard aujourd’hui, et une tâche rangée dans un bloc le jour du bloc', () => {
    const { spreads } = spreadTasks(
      [
        task('retard', { dueDate: '2026-09-20' }),
        task('dans-un-bloc', { dueDate: '2026-10-20', blockDate: '2026-09-30' }),
        task('bloc-passe', { dueDate: '2026-10-02', blockDate: '2026-09-22' }),
      ],
      PROJECTS,
      TODAY,
    );
    expect(spreads.map((s) => [s.task.id, s.from, s.to, s.late, s.placed])).toEqual([
      ['retard', TODAY, TODAY, true, false],
      ['dans-un-bloc', '2026-09-30', '2026-09-30', false, true],
      // Le bloc est passé sans que la tâche soit faite : elle revient à sa deadline.
      ['bloc-passe', TODAY, '2026-10-02', false, false],
    ]);
  });

  it('laisse de côté ce qui n’a pas de deadline, mais le compte dans le reste du projet', () => {
    const projects: LoadProject[] = [{ id: 'libre', startDate: null, deadline: null }];
    const work = spreadTasks(
      [
        task('c', { estimateMin: 45 }),
        task('a', { projectId: 'libre', projectName: 'Libre', estimateMin: 90 }),
        task('b', { projectId: 'libre', projectName: 'Libre', estimateMin: null }),
        task('d', { projectId: 'libre', projectName: 'Libre', dueDate: '2026-10-01' }),
      ],
      projects,
      TODAY,
    );
    expect(work.spreads.map((s) => s.task.id)).toEqual(['d']);
    // Par projet, ce qui est sans projet en dernier.
    expect(work.undated).toEqual([
      { projectId: 'libre', name: 'Libre', count: 2, minutes: 90 + 30 },
      { projectId: null, name: null, count: 1, minutes: 45 },
    ]);
    expect(work.remaining.get('libre')).toEqual({ minutes: 90 + 30 + 60, unestimated: 1 });
  });
});

describe('charge par semaine', () => {
  const tasks = [
    // 10 jours, du ven. 25 sept. au dim. 4 oct. : 3 jours cette semaine, 7 la suivante.
    task('maquette', { projectId: 'site', projectName: 'Site', estimateMin: 600 }),
    task('retard', { dueDate: '2026-09-20', estimateMin: 30 }),
    // 14 jours, du lun. 5 au dim. 18 oct., sans estimation : 30 min.
    task('appli', { projectId: 'appli', projectName: 'Appli', estimateMin: null }),
    task('bloc', { projectId: 'site', projectName: 'Site', estimateMin: 45, blockDate: '2026-09-29', dueDate: '2026-10-20' }),
  ];
  const blocks = [
    block('2026-09-24', '09:00', '12:00'), // passé
    block('2026-09-25', '14:00', '16:00'),
    block('2026-09-25', '17:00', '18:00', { status: 'done' }),
    block('2026-09-26', '10:00', '12:00', { mode: 'school' }),
    block('2026-09-29', '09:00', '10:30', { mode: 'both' }),
  ];
  const { spreads } = spreadTasks(tasks, PROJECTS, TODAY);
  const load = weeklyWorkload(spreads, blocks, PERIOD, TODAY);

  it('ne compte rien dans une semaine finie', () => {
    expect(load[0]).toMatchObject({ week: '2026-09-14', past: true, todoMin: 0, plannedMin: 0 });
  });

  it('répartit le travail au prorata des jours, avec la part de chaque projet', () => {
    expect(load.map((w) => [w.week, Math.round(w.todoMin)])).toEqual([
      ['2026-09-14', 0],
      ['2026-09-21', 180 + 30],
      ['2026-09-28', 420 + 45],
      ['2026-10-05', 15],
      ['2026-10-12', 15],
      ['2026-10-19', 0],
    ]);
    expect(load[1]!.lateMin).toBe(30);
    expect(load[1]!.byProject).toEqual([
      { projectId: 'site', name: 'Site', minutes: 180 },
      { projectId: null, name: null, minutes: 30 },
    ]);
    expect(load[3]!.unestimated).toBe(1);
    expect(projectWeekMinutes(load, 'site').map((w) => Math.round(w.minutes))).toEqual([0, 180, 465, 0, 0, 0]);
  });

  it('compte le temps posé : blocs Travail ou « Les deux », prévus, à partir d’aujourd’hui', () => {
    expect(load.map((w) => w.plannedMin)).toEqual([0, 120, 90, 0, 0, 0]);
    expect(isWorkTime(block('2026-09-25', '08:00', '09:00', { mode: 'school' }), TODAY)).toBe(false);
    expect(isWorkTime(block('2026-09-24', '08:00', '09:00'), TODAY)).toBe(false);
  });

  it('dit ce qui manque, et ne le signale que quand on peut s’y attendre', () => {
    expect(weekShortage(load[1]!)).toBe(90);
    expect(isWeekShort(load[1]!, TODAY)).toBe(true); // cette semaine
    expect(isWeekShort(load[2]!, TODAY)).toBe(true); // la suivante
    // Plus loin, rien n'est encore posé : pas d'alerte…
    expect(isWeekShort(load[3]!, TODAY)).toBe(false);
    // … sauf si des blocs y sont déjà posés et ne suffisent pas.
    expect(isWeekShort({ ...load[3]!, todoMin: 180, plannedMin: 60 }, TODAY)).toBe(true);
    // Un quart d'heure d'écart ne compte pas.
    expect(weekShortage({ todoMin: 130, plannedMin: 120 })).toBe(0);
    expect(isWeekShort(load[0]!, TODAY)).toBe(false);
  });

  it('arrondit l’affichage au quart d’heure, jamais à zéro', () => {
    expect(displayMinutes(0)).toBe(0);
    expect(displayMinutes(4)).toBe(15);
    expect(displayMinutes(36)).toBe(30);
    expect(displayMinutes(38)).toBe(45);
  });
});
