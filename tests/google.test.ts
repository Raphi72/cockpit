import { describe, expect, it } from 'vitest';
import { listAgenda } from '@/domains/agenda/repository';
import { isMovable, isShownInMonth } from '@/domains/agenda/model';
import { sql } from '@/core/db/client';
import { googleWhen } from '@/domains/google/components/GoogleEventDialog';
import {
  courseName,
  googleItemId,
  nearestPaletteKey,
  planCalendars,
  splitGoogleItemId,
  syncWindow,
  toLocalEvent,
  type RemoteCalendar,
  type RemoteEvent,
} from '@/domains/google/model';
import {
  clearGoogleStatement,
  getGoogleEvent,
  homeworkDueOn,
  listCoursesOn,
  listGoogleCalendars,
  nextCourseDay,
  setCalendarColorStatement,
  setCalendarSchoolStatement,
  setCalendarShownStatement,
  setCourseLinkStatement,
} from '@/domains/google/repository';
import { syncGoogle, type GoogleSource } from '@/domains/google/service';
import { listTimedEventsBetween } from '@/domains/notifications/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
const TODAY = '2026-11-26';

const remoteEvent = (patch: Partial<RemoteEvent>): RemoteEvent => ({
  id: 'e1',
  title: 'Dentiste',
  location: null,
  start: '2026-11-27T10:00:00+01:00',
  end: '2026-11-27T11:00:00+01:00',
  allDay: false,
  htmlLink: null,
  ...patch,
});

describe('Google Agenda : règles', () => {
  it('ramène les événements aux formes du calendrier', () => {
    expect(toLocalEvent(remoteEvent({ location: 'Lyon' }))).toEqual({
      id: 'e1',
      title: 'Dentiste',
      location: 'Lyon',
      startsAt: '2026-11-27T10:00',
      endsAt: '2026-11-27T11:00',
      allDay: false,
      htmlLink: null,
    });
    // Google exclut le dernier jour ; Cockpit le compte.
    expect(toLocalEvent(remoteEvent({ allDay: true, start: '2026-11-28', end: '2026-11-29' }))).toMatchObject({ startsAt: '2026-11-28', endsAt: null, allDay: true });
    expect(toLocalEvent(remoteEvent({ allDay: true, start: '2026-12-21', end: '2027-01-04' }))).toMatchObject({ startsAt: '2026-12-21', endsAt: '2027-01-03' });
    expect(syncWindow(TODAY)).toEqual({ from: '2026-10-22', to: '2027-12-31', timeMin: '2026-10-22T00:00:00Z', timeMax: '2027-12-31T00:00:00Z' });
  });

  it('prend la couleur de la palette la plus proche', () => {
    expect(nearestPaletteKey('#9fe1e7')).toBe('teal');
    expect(nearestPaletteKey('#f83a22')).toBe('red');
    expect(nearestPaletteKey('#16a765')).toBe('green');
    expect(nearestPaletteKey('#4986e7')).toBe('blue');
    expect(nearestPaletteKey('#fad165')).toBe('amber');
    expect(nearestPaletteKey('#ff7537')).toBe('orange');
    expect(nearestPaletteKey('#f691b2')).toBe('pink');
    expect(nearestPaletteKey('#cabdbf')).toBe('slate');
    expect(nearestPaletteKey(null)).toBe('slate');
    expect(nearestPaletteKey('rouge')).toBe('slate');
  });

  it('compare les agendas de Google à ceux gardés', () => {
    const remote: RemoteCalendar[] = [
      { id: 'a', name: 'A', color: null, primary: true, selected: true },
      { id: 'b', name: 'B', color: null, primary: false, selected: false },
    ];
    const plan = planCalendars(remote, [{ id: 'b' }, { id: 'c' }]);
    expect(plan.added.map((c) => c.id)).toEqual(['a']);
    expect(plan.kept.map((c) => c.id)).toEqual(['b']);
    expect(plan.removed).toEqual(['c']);
    const id = googleItemId('fr.french#holiday@group.v.calendar.google.com', 'abc_20261126');
    expect(splitGoogleItemId(id)).toEqual({ calendarId: 'fr.french#holiday@group.v.calendar.google.com', eventId: 'abc_20261126' });
  });

  it('dit quand a lieu un événement', () => {
    expect(googleWhen({ startsAt: '2026-11-26T10:00', endsAt: '2026-11-26T11:30', allDay: false })).toBe('jeudi 26 novembre, 10:00 – 11:30');
    expect(googleWhen({ startsAt: '2026-11-28', endsAt: null, allDay: true })).toBe('samedi 28 novembre');
    expect(googleWhen({ startsAt: '2026-12-21', endsAt: '2027-01-03', allDay: true })).toBe('du lundi 21 décembre au dimanche 3 janvier');
  });
});

describe('Google Agenda : relecture', () => {
  const calendars: RemoteCalendar[] = [
    { id: 'moi@gmail.com', name: 'Perso', color: '#16a765', primary: true, selected: true },
    { id: 'cours@group.calendar.google.com', name: 'Cours', color: '#4986e7', primary: false, selected: true },
    { id: 'fetes', name: 'Jours fériés', color: '#cabdbf', primary: false, selected: false },
  ];
  const eventsByCalendar: Record<string, RemoteEvent[]> = {
    'moi@gmail.com': [remoteEvent({ id: 'e1', location: 'Lyon', htmlLink: 'https://www.google.com/calendar/event?eid=1' }), remoteEvent({ id: 'e2', title: 'Vacances', allDay: true, start: '2026-11-28', end: '2026-11-30' })],
    'cours@group.calendar.google.com': [remoteEvent({ id: 'e1', title: 'Oral', start: '2026-11-26T14:00:00+01:00', end: '2026-11-26T15:00:00+01:00' })],
    fetes: [remoteEvent({ id: 'noel', title: 'Noël', allDay: true, start: '2026-12-25', end: '2026-12-26' })],
  };
  const fetched: string[] = [];
  const source = (list = calendars): GoogleSource => ({
    calendars: async () => list,
    events: async (calendarId, timeMin, timeMax, timeZone) => {
      fetched.push(`${calendarId} ${timeMin} ${timeMax} ${timeZone}`);
      return eventsByCalendar[calendarId] ?? [];
    },
  });

  it('copie les agendas cochés dans Google et les mêle au calendrier', async () => {
    const { db } = createTestDb();
    fetched.length = 0;
    expect(await syncGoogle(db, source(), TODAY, 'Europe/Paris', NOW)).toBe(3);
    // Les jours fériés, décochés dans Google, ne sont pas relus.
    expect(fetched).toEqual([
      'moi@gmail.com 2026-10-22T00:00:00Z 2027-12-31T00:00:00Z Europe/Paris',
      'cours@group.calendar.google.com 2026-10-22T00:00:00Z 2027-12-31T00:00:00Z Europe/Paris',
    ]);
    expect((await listGoogleCalendars(db)).map((c) => [c.name, c.color, c.shown, c.isPrimary, c.syncedAt !== null])).toEqual([
      ['Perso', 'green', true, true, true],
      ['Cours', 'blue', true, false, true],
      ['Jours fériés', 'slate', false, false, false],
    ]);

    const agenda = (await listAgenda(db, TODAY, '2026-12-01')).filter((i) => i.source === 'google');
    expect(agenda.map((i) => [i.title, i.start, i.end, i.allDay, i.color, i.detail])).toEqual([
      ['Oral', '2026-11-26T14:00', '2026-11-26T15:00', false, 'blue', null],
      ['Dentiste', '2026-11-27T10:00', '2026-11-27T11:00', false, 'green', 'Lyon'],
      ['Vacances', '2026-11-28', '2026-11-29', true, 'green', null],
    ]);
    expect(isMovable(agenda[0]!)).toBe(false);
    // Le même identifiant d'événement dans deux agendas : deux éléments distincts.
    expect(new Set(agenda.map((i) => i.key)).size).toBe(3);

    const detail = await getGoogleEvent(db, 'moi@gmail.com', 'e1');
    expect(detail).toMatchObject({ title: 'Dentiste', calendarName: 'Perso', color: 'green', allDay: false, htmlLink: 'https://www.google.com/calendar/event?eid=1' });

    // Rappel « Rendez-vous » : les événements Google à heure fixe en font partie.
    expect((await listTimedEventsBetween(db, '2026-11-26T13:50', '2026-11-26T14:05')).map((e) => [e.id, e.title])).toEqual([
      ['cours@group.calendar.google.com|e1', 'Oral'],
    ]);
  });

  it('garde les choix faits dans Cockpit, oublie les agendas disparus, et vide tout à la déconnexion', async () => {
    const { db } = createTestDb();
    await syncGoogle(db, source(), TODAY, 'Europe/Paris', NOW);
    await db.batch([setCalendarColorStatement('moi@gmail.com', 'violet', NOW), setCalendarShownStatement('cours@group.calendar.google.com', false, NOW)]);
    // Un événement annulé chez Google disparaît à la relecture suivante.
    eventsByCalendar['moi@gmail.com'] = eventsByCalendar['moi@gmail.com']!.slice(0, 1);
    await syncGoogle(db, source([{ ...calendars[0]!, name: 'Perso (renommé)' }, calendars[1]!]), TODAY, 'Europe/Paris', NOW);
    expect((await listGoogleCalendars(db)).map((c) => [c.name, c.color, c.shown])).toEqual([
      ['Perso (renommé)', 'violet', true],
      ['Cours', 'blue', false],
    ]);
    const agenda = (await listAgenda(db, TODAY, '2026-12-01')).filter((i) => i.source === 'google');
    expect(agenda.map((i) => i.title)).toEqual(['Dentiste']);
    expect(agenda[0]?.color).toBe('violet');

    await db.batch([clearGoogleStatement()]);
    expect(await listGoogleCalendars(db)).toEqual([]);
    expect(await db.query('SELECT id FROM google_events')).toEqual([]);
  });
});

describe('Google Agenda : l’agenda des cours', () => {
  it('ramène un intitulé de cours à sa matière', () => {
    expect(courseName('Maths - TD')).toBe('Maths');
    expect(courseName('Maths (CM)')).toBe('Maths');
    expect(courseName('Anglais - TD - Gr 2')).toBe('Anglais');
    expect(courseName('R1.01 - Initiation au développement - TP 2')).toBe('R1.01 - Initiation au développement');
    expect(courseName('Physique TD2')).toBe('Physique');
    expect(courseName('Droit civil [TD] G3')).toBe('Droit civil');
    expect(courseName('Projet tutoré')).toBe('Projet tutoré');
    expect(courseName('TD')).toBe('TD');
  });

  it('crée les matières toutes seules, relie les cours, et ouvre les devoirs au cours suivant', async () => {
    const { db } = createTestDb();
    await db.batch([sql`INSERT INTO subjects (id, name, color, sort_order, created_at, updated_at) VALUES ('fr', 'Francais', 'red', 1, ${NOW}, ${NOW})`]);
    const school: RemoteCalendar = { id: 'cours@import.calendar.google.com', name: 'Emploi du temps', color: '#4986e7', primary: false, selected: true };
    const events: RemoteEvent[] = [
      remoteEvent({ id: 'c1', title: 'Maths - CM', start: '2026-11-26T08:00:00+01:00', end: '2026-11-26T10:00:00+01:00', location: 'Amphi A' }),
      remoteEvent({ id: 'c2', title: 'Maths - TD', start: '2026-11-27T10:00:00+01:00', end: '2026-11-27T12:00:00+01:00' }),
      remoteEvent({ id: 'c3', title: 'Français (TD)', start: '2026-11-26T14:00:00+01:00', end: '2026-11-26T15:30:00+01:00' }),
      remoteEvent({ id: 'c4', title: 'Pause déjeuner', start: '2026-11-26T12:00:00+01:00', end: '2026-11-26T13:00:00+01:00' }),
    ];
    const source: GoogleSource = { calendars: async () => [school], events: async () => events };
    await syncGoogle(db, source, TODAY, 'Europe/Paris', NOW);
    // Pas encore l'agenda des cours : aucune matière créée.
    expect((await db.query('SELECT name FROM subjects ORDER BY name')).length).toBe(1);

    await db.batch([setCalendarSchoolStatement(school.id, true, NOW)]);
    await syncGoogle(db, source, TODAY, 'Europe/Paris', NOW);
    const subjects = await db.query<{ id: string; name: string; color: string }>('SELECT id, name, color FROM subjects ORDER BY name');
    // « Français » retrouve « Francais » (sans accents) ; « Maths » et « Pause déjeuner » sont créées.
    expect(subjects.map((s) => s.name)).toEqual(['Francais', 'Maths', 'Pause déjeuner']);
    expect(new Set(subjects.map((s) => s.color)).size).toBe(3);
    const maths = subjects.find((s) => s.name === 'Maths')!;

    // « Pause déjeuner » n'est pas un cours : ignorée, et jamais recréée.
    await db.batch([setCourseLinkStatement('Pause déjeuner', null, NOW)]);
    await syncGoogle(db, source, TODAY, 'Europe/Paris', NOW);
    expect((await db.query('SELECT COUNT(*) AS n FROM course_links WHERE subject_id IS NULL'))[0]).toEqual({ n: 1 });

    const courses = await listCoursesOn(db, TODAY);
    expect(courses.map((c) => [c.title, c.startsAt, c.subjectName, c.location])).toEqual([
      ['Maths - CM', '2026-11-26T08:00', 'Maths', 'Amphi A'],
      ['Français (TD)', '2026-11-26T14:00', 'Francais', null],
    ]);
    expect(await nextCourseDay(db, maths.id, TODAY)).toBe('2026-11-27');
    expect(await nextCourseDay(db, maths.id, '2026-11-27')).toBeNull();

    const agenda = (await listAgenda(db, TODAY, '2026-11-28')).filter((i) => i.source === 'google');
    const cm = agenda.find((i) => i.title === 'Maths - CM')!;
    expect(cm).toMatchObject({ kind: 'class', subjectId: maths.id, color: maths.color });
    expect(isShownInMonth(cm)).toBe(false);
    expect(agenda.find((i) => i.title === 'Pause déjeuner')).toMatchObject({ kind: 'google', subjectId: null });

    const detail = await getGoogleEvent(db, school.id, 'c1');
    expect(detail).toMatchObject({ isSchool: true, course: 'Maths', subjectId: maths.id, subjectName: 'Maths', ignored: false });
    expect(await getGoogleEvent(db, school.id, 'c4')).toMatchObject({ ignored: true, subjectId: null });

    await db.batch([
      sql`INSERT INTO tasks (id, title, status, priority, sort_order, subject_id, due_date, created_at, updated_at)
          VALUES ('h1', 'Exercices p. 42', 'todo', 1, 1, ${maths.id}, '2026-11-27', ${NOW}, ${NOW})`,
    ]);
    expect(await homeworkDueOn(db, maths.id, '2026-11-27')).toEqual([{ id: 'h1', title: 'Exercices p. 42', status: 'todo' }]);
    // Les cours ne déclenchent pas le rappel « Rendez-vous ».
    expect(await listTimedEventsBetween(db, '2026-11-26T07:50', '2026-11-26T08:05')).toEqual([]);
  });
});
