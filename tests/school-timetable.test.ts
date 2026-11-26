import { describe, expect, it } from 'vitest';
import { isMovable, isShownInMonth } from '@/domains/agenda/model';
import { listAgenda } from '@/domains/agenda/repository';
import {
  currentSemester,
  hasClassesOn,
  schoolStatus,
  semesterOn,
  suggestedSemesters,
  validatePeriod,
  type SchoolPeriod,
} from '@/domains/school/periods/model';
import { insertPeriodStatement } from '@/domains/school/periods/repository';
import { normalizeSubject } from '@/domains/school/subjects/model';
import { insertSubjectStatement } from '@/domains/school/subjects/repository';
import {
  classesBetween,
  classesOn,
  currentOrNextClass,
  gridHours,
  gridWeekdays,
  isoWeekday,
  layoutDay,
  validateSlot,
  weeklyMinutes,
  type TimetableSlot,
} from '@/domains/school/timetable/model';
import { insertSlotStatement, listSlots } from '@/domains/school/timetable/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';

const periods: SchoolPeriod[] = [
  { id: 's1', kind: 'semester', name: 'Semestre 1', startsOn: '2026-09-01', endsOn: '2027-01-31' },
  { id: 's2', kind: 'semester', name: 'Semestre 2', startsOn: '2027-02-01', endsOn: '2027-06-30' },
  { id: 'v1', kind: 'holiday', name: 'Vacances de Noël', startsOn: '2026-12-19', endsOn: '2027-01-03' },
];

const slot = (id: string, weekday: TimetableSlot['weekday'], startsAt: string, endsAt: string): TimetableSlot => ({
  id,
  subjectId: 'maths',
  subjectName: 'Maths',
  subjectColor: 'blue',
  subjectRoom: 'B204',
  weekday,
  startsAt,
  endsAt,
  label: null,
  room: null,
});

describe('calendrier scolaire', () => {
  it('situe un jour : semestre, vacances, jours avec cours', () => {
    expect(semesterOn(periods, '2026-11-26')?.name).toBe('Semestre 1');
    expect(semesterOn(periods, '2027-07-10')).toBeNull();
    expect(hasClassesOn(periods, '2026-11-26')).toBe(true);
    expect(hasClassesOn(periods, '2026-12-24')).toBe(false); // vacances
    expect(hasClassesOn(periods, '2027-07-10')).toBe(false); // hors semestre
    // Sans semestre saisi, la semaine type vaut toute l'année (hors vacances).
    expect(hasClassesOn([], '2027-07-10')).toBe(true);
    expect(currentSemester(periods, '2027-07-10')?.name).toBe('Semestre 2');
    expect(currentSemester(periods, '2026-08-20')?.name).toBe('Semestre 1');
  });

  it('refuse des semestres qui se chevauchent, pas des vacances', () => {
    expect(validatePeriod({ kind: 'semester', name: 'S3', startsOn: '2027-06-01', endsOn: '2027-08-01' }, periods)).toBe(
      'Chevauche « Semestre 2 ».',
    );
    expect(validatePeriod({ kind: 'holiday', name: 'Février', startsOn: '2027-02-13', endsOn: '2027-02-28' }, periods)).toBeNull();
    expect(validatePeriod({ kind: 'holiday', name: 'X', startsOn: '2027-02-13', endsOn: '2027-02-01' }, periods)).toBe(
      'La fin doit venir après le début.',
    );
  });

  it('propose les deux semestres de l’année scolaire en cours', () => {
    expect(suggestedSemesters('2026-11-26').map((p) => [p.startsOn, p.endsOn])).toEqual([
      ['2026-09-01', '2027-01-31'],
      ['2027-02-01', '2027-06-30'],
    ]);
    expect(suggestedSemesters('2027-03-10')[0]?.startsOn).toBe('2026-09-01');
  });

  it('dit où l’on en est', () => {
    expect(schoolStatus(periods, '2026-11-26')).toBe('Semestre 1, jusqu’au 31 janv. · Vacances de Noël le 19 déc.');
    expect(schoolStatus(periods, '2026-12-24')).toBe('Vacances de Noël : pas de cours jusqu’au 3 janv.');
    expect(schoolStatus([], '2026-11-26')).toBeNull();
  });
});

describe('emploi du temps : la semaine type', () => {
  const slots = [slot('a', 4, '10:00', '12:00'), slot('b', 4, '08:00', '10:00'), slot('c', 1, '14:00', '16:00')];

  it('calcule les cours d’un jour, ni en vacances ni hors semestre', () => {
    expect(isoWeekday('2026-11-26')).toBe(4); // jeudi
    expect(isoWeekday('2026-11-29')).toBe(7); // dimanche
    expect(classesOn(slots, periods, '2026-11-26').map((c) => [c.slot.id, c.start])).toEqual([
      ['b', '2026-11-26T08:00'],
      ['a', '2026-11-26T10:00'],
    ]);
    expect(classesOn(slots, periods, '2026-12-24')).toEqual([]);
    expect(classesBetween(slots, periods, '2026-11-23', '2026-11-30')).toHaveLength(3);
  });

  it('trouve le cours en cours ou le prochain', () => {
    const today = classesOn(slots, periods, '2026-11-26');
    expect(currentOrNextClass(today, 9 * 60)).toMatchObject({ occurrence: { slot: { id: 'b' } }, now: true });
    expect(currentOrNextClass(today, 10 * 60)).toMatchObject({ occurrence: { slot: { id: 'a' } }, now: true });
    expect(currentOrNextClass(today, 7 * 60)).toMatchObject({ occurrence: { slot: { id: 'b' } }, now: false });
    expect(currentOrNextClass(today, 12 * 60)).toBeNull();
  });

  it('dessine la grille : jours, heures, cours qui se chevauchent côte à côte', () => {
    expect(gridWeekdays(slots)).toEqual([1, 2, 3, 4, 5]);
    expect(gridWeekdays([slot('s', 6, '09:00', '12:00')])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(gridHours([slot('s', 1, '07:30', '19:15')])).toEqual({ first: 7, last: 20 });
    const overlap = layoutDay([slot('x', 1, '08:00', '10:00'), slot('y', 1, '09:00', '11:00'), slot('z', 1, '11:00', '12:00')]);
    expect(overlap.map((b) => [b.slot.id, b.lane, b.lanes])).toEqual([
      ['x', 0, 2],
      ['y', 1, 2],
      ['z', 0, 1],
    ]);
    expect(weeklyMinutes(slots)).toBe(6 * 60);
  });

  it('demande une matière et une fin après le début', () => {
    const input = { subjectId: 'maths', weekday: 1 as const, startsAt: '08:00', endsAt: '10:00', label: '', room: '' };
    expect(validateSlot(input)).toEqual({});
    expect(validateSlot({ ...input, subjectId: null }).subjectId).toBeDefined();
    expect(validateSlot({ ...input, endsAt: '07:00' }).time).toBeDefined();
  });

  it('met les cours dans l’agenda, sans les glisser ni les montrer au mois', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertSubjectStatement('maths', normalizeSubject({ name: 'Maths', color: 'blue', teacher: '', room: 'B204', coefficient: '1' }), NOW),
      insertSlotStatement('a', { subjectId: 'maths', weekday: 4, startsAt: '08:00', endsAt: '10:00', label: 'TD', room: '' }, NOW),
      ...periods.map((p) => insertPeriodStatement(p.id, p, NOW)),
    ]);
    expect((await listSlots(db))[0]).toMatchObject({ subjectName: 'Maths', subjectRoom: 'B204', label: 'TD', room: null });
    const items = await listAgenda(db, '2026-11-23', '2026-12-31');
    const classes = items.filter((i) => i.source === 'class');
    // Jeudis 26 nov., 3, 10 et 17 déc. ; le 24 et le 31 sont pendant les vacances.
    expect(classes.map((i) => i.start)).toEqual(['2026-11-26T08:00', '2026-12-03T08:00', '2026-12-10T08:00', '2026-12-17T08:00']);
    expect(classes[0]).toMatchObject({ title: 'Maths · TD', detail: 'B204', color: 'blue', subjectId: 'maths', allDay: false });
    expect(isMovable(classes[0]!)).toBe(false);
    expect(isShownInMonth(classes[0]!)).toBe(false);
  });
});
