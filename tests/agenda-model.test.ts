import { describe, expect, it } from 'vitest';
import {
  compareAgendaItems,
  defaultStartTime,
  groupByDay,
  initialTiming,
  isAgendaItemLate,
  layoutTimedItems,
  moveTimingDate,
  moveTimingStart,
  setTimingAllDay,
  shiftAnchor,
  slotStart,
  timingColumns,
  timingOf,
  upcomingDayLabel,
  upcomingDays,
  upcomingDetail,
  validateTiming,
  viewDays,
  viewRange,
  viewTitle,
  visibleHours,
  type AgendaItem,
  type EventTiming,
} from '@/domains/agenda/model';

const TODAY = '2026-09-24'; // un jeudi

const item = (overrides: Partial<AgendaItem>): AgendaItem => ({
  key: 'k',
  source: 'event',
  id: 'e1',
  kind: 'appointment',
  title: 'Élément',
  detail: null,
  start: TODAY,
  end: null,
  allDay: true,
  projectId: null,
  color: null,
  amountCents: null,
  ...overrides,
});

const timed = (overrides: Partial<EventTiming> = {}): EventTiming => ({
  date: TODAY,
  allDay: false,
  endDate: null,
  startTime: '14:00',
  endTime: '15:00',
  ...overrides,
});

describe('moment d’un événement', () => {
  it('passe des colonnes stockées à la saisie, et retour', () => {
    const event = { allDay: false, startsAt: '2026-09-24T14:00', endsAt: '2026-09-24T15:30' };
    expect(timingOf(event)).toEqual(timed({ endTime: '15:30' }));
    expect(timingColumns(timingOf(event))).toEqual(event);

    const trip = { allDay: true, startsAt: '2026-10-20', endsAt: '2026-10-27' };
    expect(timingOf(trip)).toEqual({ date: '2026-10-20', allDay: true, endDate: '2026-10-27', startTime: null, endTime: null });
    expect(timingColumns(timingOf(trip))).toEqual(trip);
    // Une fin le même jour n'est pas stockée.
    expect(timingColumns({ ...timingOf(trip), endDate: '2026-10-20' }).endsAt).toBeNull();
  });

  it('refuse une fin avant le début', () => {
    expect(validateTiming(timed())).toBeNull();
    expect(validateTiming(timed({ endTime: null }))).toBeNull();
    expect(validateTiming(timed({ endTime: '14:00' }))).toMatch(/après le début/);
    expect(validateTiming(timed({ startTime: '25:00' }))).toMatch(/début invalide/);
    expect(validateTiming(timed({ allDay: true, endDate: '2026-09-23', startTime: null, endTime: null }))).toMatch(/avant/);
    expect(validateTiming(timed({ date: '2026-02-30' }))).toMatch(/Date invalide/);
  });

  it('garde la durée quand on déplace le début ou le jour', () => {
    expect(moveTimingStart(timed({ endTime: '15:30' }), '16:00')).toMatchObject({ startTime: '16:00', endTime: '17:30' });
    // Une fin qui passerait au lendemain disparaît plutôt que d'être fausse.
    expect(moveTimingStart(timed(), '23:30')).toMatchObject({ startTime: '23:30', endTime: null });
    expect(moveTimingStart(timed({ endTime: null }), '10:00')).toMatchObject({ startTime: '10:00', endTime: null });

    const trip: EventTiming = { date: '2026-10-20', allDay: true, endDate: '2026-10-22', startTime: null, endTime: null };
    expect(moveTimingDate(trip, '2026-10-30')).toMatchObject({ date: '2026-10-30', endDate: '2026-11-01' });
    expect(moveTimingDate(timed(), '2026-09-30')).toMatchObject({ date: '2026-09-30', startTime: '14:00' });
  });

  it('bascule entre journée entière et horaires', () => {
    expect(setTimingAllDay(timed(), true, '09:00')).toEqual({ date: TODAY, allDay: true, endDate: null, startTime: null, endTime: null });
    expect(setTimingAllDay(timed({ allDay: true }), false, '09:00')).toMatchObject({ startTime: '09:00', endTime: '10:00' });
  });

  it('propose un moment selon l’endroit du clic', () => {
    const now = new Date('2026-09-24T10:23:00');
    expect(defaultStartTime(TODAY, TODAY, now)).toBe('11:00');
    expect(defaultStartTime(TODAY, TODAY, new Date('2026-09-24T22:10:00'))).toBe('20:00');
    expect(defaultStartTime('2026-09-30', TODAY, now)).toBe('09:00');

    expect(initialTiming({}, TODAY, now)).toMatchObject({ date: TODAY, allDay: false, startTime: '11:00', endTime: '12:00' });
    expect(initialTiming({ eventStart: '2026-10-02' }, TODAY, now)).toMatchObject({ date: '2026-10-02', startTime: '09:00' });
    expect(initialTiming({ eventStart: '2026-10-02T14:30' }, TODAY, now)).toMatchObject({ startTime: '14:30', endTime: '15:30' });
    expect(initialTiming({ eventStart: '2026-10-02', eventAllDay: true }, TODAY, now)).toMatchObject({ allDay: true, startTime: null });
  });
});

describe('agenda', () => {
  it('signale en retard les deadlines et encaissements passés, jamais les événements', () => {
    expect(isAgendaItemLate(item({ kind: 'task_due', start: '2026-09-23' }), TODAY)).toBe(true);
    expect(isAgendaItemLate(item({ kind: 'payment_due', start: TODAY }), TODAY)).toBe(false);
    expect(isAgendaItemLate(item({ kind: 'appointment', start: '2026-09-01' }), TODAY)).toBe(false);
    expect(isAgendaItemLate(item({ kind: 'project_start', start: '2026-09-01' }), TODAY)).toBe(false);
  });

  it('range une journée : événements, deadlines, encaissements, puis le reste', () => {
    const list = [
      item({ key: 'tache', kind: 'task_scheduled' }),
      item({ key: 'paiement', kind: 'payment_due' }),
      item({ key: 'rdv-15h', allDay: false, start: `${TODAY}T15:00` }),
      item({ key: 'rdv-9h', allDay: false, start: `${TODAY}T09:00` }),
      item({ key: 'deadline', kind: 'project_deadline' }),
      item({ key: 'journee', kind: 'personal' }),
    ];
    expect(list.sort(compareAgendaItems).map((i) => i.key)).toEqual([
      'journee',
      'rdv-9h',
      'rdv-15h',
      'deadline',
      'paiement',
      'tache',
    ]);
  });

  it('répartit par jour, un événement sur plusieurs jours dans chacun', () => {
    const days = ['2026-09-24', '2026-09-25', '2026-09-26'];
    const groups = groupByDay(
      [
        item({ key: 'salon', start: '2026-09-20', end: '2026-09-25' }),
        item({ key: 'rdv', allDay: false, start: '2026-09-26T10:00', end: '2026-09-26T11:00' }),
      ],
      days,
    );
    expect([...groups.entries()].map(([day, list]) => [day, list.map((i) => i.key)])).toEqual([
      ['2026-09-24', ['salon']],
      ['2026-09-25', ['salon']],
      ['2026-09-26', ['rdv']],
    ]);
  });
});

describe('vues du calendrier', () => {
  it('affiche 6 semaines complètes pour un mois, du lundi au dimanche', () => {
    const days = viewDays('month', TODAY);
    expect(days).toHaveLength(42);
    expect(days[0]).toBe('2026-08-31'); // lundi avant le 1er septembre (un mardi)
    expect(viewRange(days)).toEqual({ from: '2026-08-31', to: '2026-10-12' });
    expect(viewDays('week', TODAY)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(viewRange(viewDays('day', TODAY))).toEqual({ from: TODAY, to: '2026-09-25' });
  });

  it('passe à la période suivante ou précédente', () => {
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftAnchor('week', TODAY, -1)).toBe('2026-09-17');
    expect(shiftAnchor('day', '2026-09-30', 1)).toBe('2026-10-01');
  });

  it('titre la période', () => {
    expect(viewTitle('month', TODAY, TODAY)).toBe('Septembre');
    expect(viewTitle('month', '2027-01-10', TODAY)).toBe('Janvier 2027');
    expect(viewTitle('week', TODAY, TODAY)).toBe('21 – 27 septembre');
    expect(viewTitle('week', '2026-10-01', TODAY)).toBe('28 sept. – 4 oct.');
    expect(viewTitle('week', '2026-12-30', TODAY)).toBe('28 déc. 2026 – 3 janv. 2027');
    expect(viewTitle('day', TODAY, TODAY)).toBe('Jeudi 24 septembre');
  });
});

describe('grille horaire', () => {
  const at = (key: string, start: string, end: string | null) =>
    item({ key, allDay: false, start: `${TODAY}T${start}`, end: end && `${TODAY}T${end}` });

  it('partage la largeur entre événements qui se chevauchent', () => {
    const blocks = layoutTimedItems([
      at('a', '09:00', '10:00'),
      at('b', '09:30', '11:00'),
      at('c', '10:00', '10:30'),
      at('d', '14:00', null),
    ]);
    const byKey = Object.fromEntries(blocks.map((b) => [b.item.key, b]));
    expect(byKey.a).toMatchObject({ column: 0, columns: 2 });
    expect(byKey.b).toMatchObject({ column: 1, columns: 2 });
    expect(byKey.c).toMatchObject({ column: 0, columns: 2 }); // reprend la colonne libérée par « a »
    expect(byKey.d).toMatchObject({ column: 0, columns: 1, start: 14 * 60, end: 15 * 60 }); // 1 h par défaut
  });

  it('élargit les heures affichées si besoin, et arrondit un clic à la demi-heure', () => {
    expect(visibleHours([])).toEqual({ first: 8, last: 20 });
    expect(visibleHours(layoutTimedItems([at('tôt', '07:15', '08:00'), at('tard', '20:00', '21:30')]))).toEqual({
      first: 7,
      last: 22,
    });
    expect(slotStart(14 * 60 + 47)).toBe('14:30');
    expect(slotStart(24 * 60 + 10)).toBe('23:30');
  });
});

describe('prochains jours (dashboard)', () => {
  it('garde les jours qui ont quelque chose, sans les tâches, dans l’ordre d’une journée', () => {
    const days = upcomingDays(
      [
        item({ key: 'pay', source: 'payment', kind: 'payment_due', start: '2026-09-25', amountCents: 75000 }),
        item({ key: 'deadline', source: 'project', kind: 'project_deadline', start: '2026-09-28' }),
        item({ key: 'rdv', allDay: false, start: '2026-09-28T14:00' }),
        item({ key: 'tâche', source: 'task', kind: 'task_due', start: '2026-09-26' }),
        item({ key: 'loin', start: '2026-10-01' }), // J+7 : hors de la semaine
      ],
      TODAY,
    );
    expect(days.map((d) => [d.day, d.items.map((i) => i.key)])).toEqual([
      ['2026-09-25', ['pay']],
      ['2026-09-28', ['rdv', 'deadline']],
    ]);
  });

  it('montre une seule fois un événement sur plusieurs jours, à son premier jour visible', () => {
    const trip = item({ key: 'voyage', start: '2026-09-22', end: '2026-09-27' });
    const salon = item({ key: 'salon', start: '2026-09-26', end: '2026-09-27' });
    expect(upcomingDays([trip, salon], TODAY).map((d) => [d.day, d.items.map((i) => i.key)])).toEqual([
      [TODAY, ['voyage']],
      ['2026-09-26', ['salon']],
    ]);
    expect(upcomingDetail(trip, TODAY)).toBe('jusqu’à dimanche');
    expect(upcomingDetail({ ...trip, detail: 'Lyon', end: '2026-10-05' }, TODAY)).toBe('Lyon · jusqu’au 5 oct.');
  });

  it('nomme les jours et précise chaque élément', () => {
    expect(upcomingDayLabel(TODAY, TODAY)).toEqual({ label: 'Aujourd’hui', date: null });
    expect(upcomingDayLabel('2026-09-25', TODAY)).toEqual({ label: 'Demain', date: '25 sept.' });
    expect(upcomingDayLabel('2026-10-01', TODAY)).toEqual({ label: 'Jeudi', date: '1 oct.' });

    expect(upcomingDetail(item({ source: 'project', kind: 'project_deadline' }), TODAY)).toBe('deadline');
    expect(upcomingDetail(item({ source: 'project', kind: 'project_start' }), TODAY)).toBe('début');
    expect(upcomingDetail(item({ source: 'payment', kind: 'payment_due', detail: 'Acompte' }), TODAY)).toBe('Acompte');
    expect(upcomingDetail(item({ detail: 'Studio Lumen' }), TODAY)).toBe('Studio Lumen');
    expect(upcomingDetail(item({}), TODAY)).toBeNull();
  });
});
