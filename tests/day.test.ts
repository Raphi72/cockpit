import { describe, expect, it } from 'vitest';
import { listAgenda } from '@/domains/agenda/repository';
import { buildShiftBatch } from '@/domains/agenda/service';
import { accepts } from '@/domains/day/components/drag';
import type { TaskItem } from '@/domains/tasks/model';
import {
  blockFromModule,
  blockFromTask,
  blockLoad,
  blocksFromWeekTemplate,
  blocksToReview,
  currentBlock,
  freeSlots,
  fromMinutes,
  isReviewTime,
  layoutIntervals,
  moduleFromBlock,
  unplaceKeepsModule,
  movedBlock,
  nextBlock,
  overlapsOf,
  proposeFill,
  resizedEnd,
  toMinutes,
  validateBlock,
  validateModule,
  weekDays,
  weekTemplateFromBlocks,
  type DayBlock,
  type Module,
} from '@/domains/day/model';
import {
  deleteBlockStatement,
  deleteModuleStatement,
  insertBlockStatement,
  insertModuleStatement,
  listBlocks,
  listModules,
  setTasksBlockStatement,
} from '@/domains/day/repository';
import { buildFillProposals, busyItemsOn, toPlaceOn } from '@/domains/day/service';
import { blockNotices } from '@/domains/notifications/model';
import { effectiveDate, isTaskForToday } from '@/domains/tasks/model';
import { getTask, insertTaskStatement, listOpenTasks, listTasksInBlocks } from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
const TODAY = '2026-11-26';

const sport: Module = { id: 'module-sport', name: 'Sport', icon: 'dumbbell', color: 'green', durationMin: 180, mode: 'both', sortOrder: 1 };

const block = (id: string, startsAt: string, endsAt: string, patch: Partial<DayBlock> = {}): DayBlock => ({
  id,
  templateId: null,
  date: TODAY,
  startsAt,
  endsAt,
  title: id,
  icon: 'brain',
  color: 'violet',
  mode: 'work',
  status: 'planned',
  ...patch,
});

describe('journée : heures et blocs', () => {
  it('compte en minutes, minuit compris', () => {
    expect(toMinutes('14:30')).toBe(870);
    expect(toMinutes('24:00')).toBe(1440);
    expect(fromMinutes(870)).toBe('14:30');
    expect(fromMinutes(1440)).toBe('24:00');
    expect(fromMinutes(1500)).toBe('24:00');
  });

  it('pose un module au quart d’heure, sans dépasser minuit', () => {
    expect(blockFromModule(sport, TODAY, 10 * 60 + 7)).toMatchObject({
      templateId: 'module-sport',
      startsAt: '10:00',
      endsAt: '13:00',
      title: 'Sport',
      icon: 'dumbbell',
      color: 'green',
      mode: 'both',
    });
    expect(blockFromModule(sport, TODAY, 22 * 60)).toMatchObject({ startsAt: '22:00', endsAt: '24:00' });
  });

  it('déplace un bloc en gardant sa durée, et l’étire au quart d’heure', () => {
    expect(movedBlock({ startsAt: '10:00', endsAt: '12:00' }, '2026-11-27', 14 * 60 + 8)).toEqual({
      date: '2026-11-27',
      startsAt: '14:15',
      endsAt: '16:15',
    });
    expect(movedBlock({ startsAt: '10:00', endsAt: '12:00' }, TODAY, 23 * 60)).toMatchObject({ startsAt: '22:00', endsAt: '24:00' });
    expect(resizedEnd({ startsAt: '10:00' }, 12 * 60 + 20)).toBe('12:15');
    expect(resizedEnd({ startsAt: '10:00' }, 9 * 60)).toBe('10:15');
  });

  it('valide un module et un bloc', () => {
    expect(validateModule({ name: 'Lecture', icon: 'book', color: 'amber', durationMin: 45, mode: 'both' })).toEqual({});
    expect(validateModule({ name: ' ', icon: 'book', color: 'amber', durationMin: 5, mode: 'both' })).toMatchObject({
      name: expect.any(String),
      durationMin: expect.any(String),
    });
    expect(validateBlock({ title: 'Sport', date: TODAY, startsAt: '10:00', endsAt: '10:10' })).toBe('Un bloc dure au moins 15 minutes.');
    expect(validateBlock({ title: 'Sport', date: TODAY, startsAt: '22:00', endsAt: '24:00' })).toBeNull();
  });

  it('place côte à côte ce qui se chevauche, et signale les chevauchements', () => {
    const placed = layoutIntervals([block('a', '10:00', '12:00'), block('b', '11:00', '13:00'), block('c', '13:00', '14:00')], (b) => ({
      start: toMinutes(b.startsAt),
      end: toMinutes(b.endsAt),
    }));
    expect(placed.map((p) => [p.item.id, p.lane, p.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
    const busy = [{ key: 'cours', title: 'Maths', start: 8 * 60, end: 10 * 60 + 30 }];
    expect(overlapsOf(block('a', '10:00', '12:00'), busy).map((b) => b.title)).toEqual(['Maths']);
    expect(overlapsOf(block('c', '13:00', '14:00'), busy)).toEqual([]);
  });

  it('un cours et un bloc qui se chevauchent se rangent côte à côte', () => {
    type Entry = { key: string; start: number; end: number };
    const entries: Entry[] = [
      { key: 'cours', start: 9 * 60, end: 12 * 60 },
      { key: 'bloc', start: 10 * 60, end: 11 * 60 },
      { key: 'après', start: 12 * 60, end: 13 * 60 },
    ];
    expect(layoutIntervals(entries, (e) => e).map((p) => [p.item.key, p.lane, p.lanes])).toEqual([
      ['cours', 0, 2],
      ['bloc', 1, 2],
      ['après', 0, 1],
    ]);
  });

  it('la corbeille prend les blocs et les modules, jamais les tâches', () => {
    expect(accepts('block', 'trash')).toBe(true);
    expect(accepts('module', 'trash')).toBe(true);
    expect(accepts('task', 'trash')).toBe(false);
    expect(accepts('task', 'block')).toBe(true);
    // Sur une heure libre, une tâche devient un bloc à elle.
    expect(accepts('task', 'column')).toBe(true);
    expect(accepts('block', 'column')).toBe(true);
    // Un bloc revient « à caser » ; un module de la bibliothèque, non.
    expect(accepts('block', 'to-place')).toBe(true);
    expect(accepts('module', 'to-place')).toBe(false);
  });

  it('une tâche posée sur la journée devient un bloc à elle, de la durée de son estimation', () => {
    const task = { title: 'Rédiger le compte rendu', estimateMin: 90, projectColor: 'orange' as const, subjectColor: null, subjectId: null };
    expect(blockFromTask(task, TODAY, 14 * 60 + 7)).toMatchObject({
      templateId: null,
      startsAt: '14:00',
      endsAt: '15:30',
      title: 'Rédiger le compte rendu',
      color: 'orange',
      mode: 'work',
    });
    // Sans estimation : une heure ; un devoir prend la couleur de sa matière et le mode Cours.
    const homework = { ...task, estimateMin: null, projectColor: null, subjectColor: 'blue' as const, subjectId: 's1' };
    expect(blockFromTask(homework, TODAY, 23 * 60 + 30)).toMatchObject({ startsAt: '23:30', endsAt: '24:00', color: 'blue', mode: 'school' });
  });

  it('un bloc né d’une tâche, remis à caser, ne redevient pas un module : la tâche revient seule', () => {
    const fromTask = { title: 'Faire l’oral', templateId: null };
    expect(unplaceKeepsModule(fromTask, ['Faire l’oral'])).toBe(false);
    // Un bloc libre avec d'autres tâches, ou posé depuis un module, garde son module.
    expect(unplaceKeepsModule({ title: 'Révisions', templateId: null }, ['Faire l’oral'])).toBe(true);
    expect(unplaceKeepsModule({ title: 'Faire l’oral', templateId: 'module-1' }, ['Faire l’oral'])).toBe(true);
    expect(unplaceKeepsModule({ title: 'Courses', templateId: null }, [])).toBe(true);
  });

  it('un bloc remis à caser redevient un module pour une fois, de même durée', () => {
    expect(moduleFromBlock(block('Courses', '17:00', '18:30', { icon: 'sparkles', color: 'teal', mode: 'both' }))).toEqual({
      name: 'Courses',
      icon: 'sparkles',
      color: 'teal',
      durationMin: 90,
      mode: 'both',
      oneOff: true,
    });
  });

  it('dit ce qui reste de temps dans un bloc (30 min pour une tâche sans estimation)', () => {
    expect(blockLoad({ startsAt: '10:00', endsAt: '12:00' }, [{ estimateMin: 45 }, { estimateMin: null }])).toEqual({ used: 75, free: 45 });
    expect(blockLoad({ startsAt: '10:00', endsAt: '10:30' }, [{ estimateMin: 45 }]).free).toBe(-15);
  });

  it('trouve le bloc en cours, le suivant, et ce qu’il y a à marquer le soir', () => {
    const day = [block('a', '08:00', '10:00'), block('b', '10:00', '12:00'), block('c', '18:00', '19:00', { status: 'done' })];
    expect(currentBlock(day, 9 * 60)).toMatchObject({ block: { id: 'a' }, remaining: 60 });
    expect(currentBlock(day, 13 * 60)).toBeNull();
    expect(nextBlock(day, 9 * 60)?.id).toBe('b');
    expect(blocksToReview(day, 13 * 60).map((b) => b.id)).toEqual(['a', 'b']);
    // Pas encore l'heure du bilan à 13 h : un bloc reste à venir.
    expect(isReviewTime(day, 13 * 60)).toBe(false);
    expect(isReviewTime(day, 20 * 60)).toBe(true);
    expect(isReviewTime([block('a', '08:00', '10:00')], 11 * 60)).toBe(true);
  });
});

describe('journée : remplir les trous', () => {
  it('trouve les créneaux libres', () => {
    expect(freeSlots([{ start: 600, end: 720 }, { start: 700, end: 780 }], 480, 1260, 30)).toEqual([
      { start: 480, end: 600 },
      { start: 780, end: 1260 },
    ]);
    expect(freeSlots([{ start: 480, end: 1260 }], 480, 1260)).toEqual([]);
  });

  it('propose des blocs sans mélanger devoirs et travail, 2 h au plus', () => {
    const tasks = [
      { id: 'w1', homework: false, estimateMin: 60 },
      { id: 'h1', homework: true, estimateMin: 45 },
      { id: 'w2', homework: false, estimateMin: null },
      { id: 'w3', homework: false, estimateMin: 60 },
      { id: 'huge', homework: false, estimateMin: 300 },
    ];
    expect(proposeFill([{ start: 9 * 60 + 5, end: 12 * 60 + 30 }], tasks)).toEqual([
      { start: 555, end: 645, homework: false, taskIds: ['w1', 'w2'] },
      { start: 645, end: 690, homework: true, taskIds: ['h1'] },
      { start: 690, end: 750, homework: false, taskIds: ['w3'] },
    ]);
  });

  it('compose les blocs proposés avec l’allure des modules', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertTaskStatement('w1', { title: 'Devis', projectId: null, scheduledDate: TODAY, dueDate: TODAY, priority: 2, estimateMin: 60, notes: null }, NOW),
    ]);
    const proposals = buildFillProposals({
      day: TODAY,
      today: TODAY,
      now: 9 * 60 + 40,
      blocks: [block('matin', '10:00', '11:00')],
      busy: [],
      open: await listOpenTasks(db),
      pausedProjectIds: new Set(),
      modules: await listModules(db),
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.input).toMatchObject({ templateId: 'module-deepwork', title: 'Deep work', startsAt: '11:00', endsAt: '12:00' });
    expect(proposals[0]!.tasks.map((t) => t.id)).toEqual(['w1']);
    // Un jour passé : rien à proposer.
    expect(buildFillProposals({ day: '2026-11-20', today: TODAY, now: 0, blocks: [], busy: [], open: [], pausedProjectIds: new Set(), modules: [] })).toEqual([]);
  });
});

describe('journée : semaines types', () => {
  it('passe d’une semaine de blocs à une semaine type, et retour', () => {
    expect(weekDays('2026-11-26', 1)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(weekDays('2026-11-26', 0)[0]).toBe('2026-11-22');
    const template = weekTemplateFromBlocks([block('lundi', '08:00', '10:00', { date: '2026-11-23' }), block('jeudi', '14:00', '17:00')]);
    expect(template.map((b) => [b.weekday, b.startsAt])).toEqual([
      [1, '08:00'],
      [4, '14:00'],
    ]);
    const next = blocksFromWeekTemplate(
      template.map((b, i) => ({ ...b, id: String(i), weekTemplateId: 'w' })),
      weekDays('2026-12-03', 1),
    );
    expect(next.map((b) => [b.date, b.startsAt, b.title])).toEqual([
      ['2026-11-30', '08:00', 'lundi'],
      ['2026-12-03', '14:00', 'jeudi'],
    ]);
  });
});

describe('journée : base', () => {
  it('propose quatre modules au départ', async () => {
    const { db } = createTestDb();
    expect((await listModules(db)).map((m) => [m.name, m.durationMin, m.mode, m.oneOff])).toEqual([
      ['Sport', 180, 'both', false],
      ['Devoirs', 90, 'school', false],
      ['Deep work', 120, 'work', false],
      ['Révision', 60, 'school', false],
    ]);
  });

  it('un module « pour une fois » devient un bloc sans lien et quitte « À caser »', async () => {
    const { db } = createTestDb();
    await db.batch([insertModuleStatement('courses', { name: 'Courses', icon: 'sparkles', color: 'teal', durationMin: 60, mode: 'both', oneOff: true }, NOW)]);
    const once = (await listModules(db)).find((m) => m.id === 'courses')!;
    expect(once.oneOff).toBe(true);
    const input = blockFromModule(once, TODAY, 17 * 60);
    expect(input).toMatchObject({ templateId: null, title: 'Courses', startsAt: '17:00', endsAt: '18:00' });
    // Ce que fait usePlaceOneOff, en un lot.
    await db.batch([insertBlockStatement('posé', input, NOW), deleteModuleStatement('courses')]);
    expect((await listModules(db)).some((m) => m.id === 'courses')).toBe(false);
    expect((await listBlocks(db, TODAY, '2026-11-27')).map((b) => b.title)).toEqual(['Courses']);
    // Un module de la bibliothèque, lui, reste relié à ses blocs.
    expect(blockFromModule(sport, TODAY, 9 * 60).templateId).toBe('module-sport');
  });

  it('une tâche dans un bloc prend son jour ; supprimer le bloc la libère', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertBlockStatement('b1', { ...blockFromModule(sport, '2026-11-28', 14 * 60) }, NOW),
      insertTaskStatement('t1', { title: 'Courir', projectId: null, scheduledDate: null, dueDate: null, priority: 1, estimateMin: null, notes: null }, NOW),
      setTasksBlockStatement(['t1'], 'b1', NOW),
    ]);
    const task = (await getTask(db, 't1'))!;
    expect(task).toMatchObject({ blockId: 'b1', blockDate: '2026-11-28' });
    expect(effectiveDate(task)).toBe('2026-11-28');
    expect(isTaskForToday(task, TODAY)).toBe(false);
    expect(isTaskForToday(task, '2026-11-28')).toBe(true);
    // Le bloc passé sans que la tâche soit faite : elle revient dans Aujourd'hui.
    expect(isTaskForToday(task, '2026-11-30')).toBe(true);
    expect((await listTasksInBlocks(db, '2026-11-23', '2026-11-30')).map((t) => t.id)).toEqual(['t1']);
    expect((await listBlocks(db, '2026-11-28', '2026-11-29')).map((b) => b.title)).toEqual(['Sport']);

    await db.batch([deleteBlockStatement('b1')]);
    expect(await getTask(db, 't1')).toMatchObject({ blockId: null, blockDate: null });
  });

  it('met les blocs dans l’agenda, et les glisse d’un jour à l’autre', async () => {
    const { db } = createTestDb();
    await db.batch([insertBlockStatement('b1', blockFromModule(sport, TODAY, 22 * 60), NOW)]);
    const [item] = (await listAgenda(db, TODAY, '2026-11-27')).filter((i) => i.source === 'block');
    expect(item).toMatchObject({ kind: 'block', title: 'Sport', start: '2026-11-26T22:00', end: '2026-11-26T23:59', color: 'green' });
    await db.batch(buildShiftBatch(item!, 1, NOW).statements);
    expect((await listBlocks(db, '2026-11-27', '2026-11-28')).map((b) => b.startsAt)).toEqual(['22:00']);
  });

  it('dessine sous les blocs les cours et rendez-vous à heure fixe', () => {
    const busy = busyItemsOn(
      [
        { key: 'e', source: 'event', id: 'e', kind: 'meeting', title: 'Réunion', detail: null, start: `${TODAY}T09:00`, end: `${TODAY}T10:30`, allDay: false, projectId: null, color: null, amountCents: null },
        { key: 'd', source: 'event', id: 'd', kind: 'personal', title: 'Journée', detail: null, start: TODAY, end: null, allDay: true, projectId: null, color: null, amountCents: null },
        { key: 'p', source: 'payment', id: 'p', kind: 'payment_due', title: 'Paiement', detail: null, start: TODAY, end: null, allDay: true, projectId: null, color: null, amountCents: 100 },
      ],
      TODAY,
    );
    expect(busy).toEqual([{ key: 'e', title: 'Réunion', start: 540, end: 630, color: null, googleId: null, homework: [] }]);
  });

  it('un cours de Google montre les devoirs à rendre pour lui', () => {
    const course = {
      key: 'g',
      source: 'google' as const,
      id: 'cal|optim',
      kind: 'class' as const,
      title: 'Optimisation sous contraintes',
      detail: null,
      start: `${TODAY}T14:00`,
      end: `${TODAY}T16:00`,
      allDay: false,
      projectId: null,
      color: 'violet' as const,
      amountCents: null,
      subjectId: 'optim',
    };
    const homework = (title: string, extra: Record<string, unknown>) => ({ title, subjectId: 'optim', dueDate: null, courseEvent: null, ...extra }) as unknown as TaskItem;
    const busy = busyItemsOn([course], TODAY, [
      homework('revoir', { courseEvent: 'cal|optim' }),
      homework('autre séance', { courseEvent: 'cal|autre' }),
      homework('sans séance, ce jour', { dueDate: TODAY }),
      homework('sans séance, demain', { dueDate: '2026-11-27' }),
    ]);
    expect(busy[0]).toMatchObject({ googleId: 'cal|optim', color: 'violet', homework: ['revoir', 'sans séance, ce jour'] });
  });
});

describe('journée : notifications', () => {
  it('annonce le début et la fin d’un bloc, une seule fois', () => {
    const day = [block('Sport', '17:00', '18:00'), block('Devoirs', '18:00', '19:00'), block('Fait', '17:00', '18:00', { status: 'done' })];
    const at = (time: string) => blockNotices(day, { today: TODAY, time });
    expect(at('17:00').map((n) => n.title)).toEqual(['C’est l’heure : Sport']);
    expect(at('17:01')).toHaveLength(1);
    expect(at('17:02')).toEqual([]);
    const evening = at('18:00');
    expect(evening.map((n) => n.title)).toEqual(['Fin du bloc : Sport', 'C’est l’heure : Devoirs']);
    expect(evening[0]!.body).toBe('Ensuite : Devoirs, jusqu’à 19:00');
    expect(evening[0]!.key).toBe(`block-end:Sport:${TODAY}T18:00`);
  });
});

describe('journée : à caser', () => {
  it('montre ce qui est prévu ce jour-là, puis les échéances des deux semaines pas encore placées', async () => {
    const { db } = createTestDb();
    const add = (id: string, title: string, patch: { scheduledDate?: string | null; dueDate?: string | null } = {}) =>
      insertTaskStatement(
        id,
        { title, projectId: null, subjectId: null, scheduledDate: patch.scheduledDate ?? null, dueDate: patch.dueDate ?? null, priority: 1, estimateMin: 30, notes: null },
        NOW,
      );
    await db.batch([
      add('prevue', 'Prévue aujourd’hui', { scheduledDate: TODAY }),
      add('retard', 'En retard', { dueDate: '2026-11-20' }),
      add('lundi', 'Devoir pour lundi', { dueDate: '2026-11-30' }),
      add('mardi', 'Deadline mardi', { dueDate: '2026-12-01' }),
      add('plus-tard', 'Prévue samedi, pour mardi', { scheduledDate: '2026-11-28', dueDate: '2026-12-01' }),
      add('loin', 'Dans un mois', { dueDate: '2026-12-26' }),
      add('placee', 'Déjà dans un bloc', { dueDate: '2026-11-29' }),
      add('sans-date', 'Sans date'),
      insertBlockStatement('b1', blockFromModule(sport, TODAY, 18 * 60), NOW),
      setTasksBlockStatement(['placee'], 'b1', NOW),
    ]);
    const open = await listOpenTasks(db);
    const titles = (tasks: { title: string }[]) => tasks.map((t) => t.title);

    const today = toPlaceOn(open, TODAY, TODAY);
    expect(titles(today.planned).sort()).toEqual(['En retard', 'Prévue aujourd’hui']);
    // Les plus proches d'abord ; ni ce qui est prévu un jour plus tard, ni ce qui est loin, ni ce qui est placé.
    expect(titles(today.deadlines)).toEqual(['Devoir pour lundi', 'Deadline mardi']);

    // Le samedi : ce qui est prévu ce jour-là, puis les échéances à partir de samedi.
    const saturday = toPlaceOn(open, '2026-11-28', TODAY);
    expect(titles(saturday.planned)).toEqual(['Prévue samedi, pour mardi']);
    expect(titles(saturday.deadlines)).toEqual(['Devoir pour lundi', 'Deadline mardi']);
  });
});
