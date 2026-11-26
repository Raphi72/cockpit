import { describe, expect, it } from 'vitest';
import { listAgenda } from '@/domains/agenda/repository';
import { isMovable, isSchoolItem, isShownInMonth } from '@/domains/agenda/model';
import { schoolUpcomingItems } from '@/domains/dashboard/school-model';
import { sql } from '@/core/db/client';
import { googleWhen } from '@/domains/google/components/GoogleEventDialog';
import {
  courseName,
  googleItemId,
  isTimetableName,
  looksLikeTimetable,
  nearestPaletteKey,
  parseCourseTitle,
  SCHOOL_MANUAL_SETTING,
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
  homeworkForCourse,
  listCoursesBetween,
  listCoursesOn,
  listGoogleCalendars,
  nextCourseOccurrence,
  setCalendarColorStatement,
  setCalendarSchoolStatement,
  setCalendarShownStatement,
  setCourseLinkStatement,
} from '@/domains/google/repository';
import { syncGoogle, type GoogleSource } from '@/domains/google/service';
import { listTimedEventsBetween } from '@/domains/notifications/repository';
import { setSettingStatement } from '@/domains/settings/repository';
import { insertTaskStatement } from '@/domains/tasks/repository';
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

  it('lit les intitulés « Matière | Type | Prof » des emplois du temps d’école', () => {
    expect(parseCourseTitle('Machine Learning |  | DUPONT Marie ')).toEqual({ name: 'Machine Learning', kind: null, teacher: 'DUPONT Marie' });
    expect(parseCourseTitle('Réseaux informatiques | Cours | MARTIN Paul {ecole}')).toEqual({
      name: 'Réseaux informatiques',
      kind: 'Cours',
      teacher: 'MARTIN Paul',
    });
    // Un « : » ou un « - » fait partie du nom ; les profs en double ne comptent qu'une fois.
    expect(parseCourseTitle('Gestion de projets : déployer un projet IA | Cours | DURAND Léa, DURAND Léa, ROUX Jean')).toEqual({
      name: 'Gestion de projets : déployer un projet IA',
      kind: 'Cours',
      teacher: 'DURAND Léa, ROUX Jean',
    });
    expect(parseCourseTitle('Atelier - Sécurité (obligatoire) |  |  ')).toEqual({ name: 'Atelier - Sécurité (obligatoire)', kind: null, teacher: null });
    expect(parseCourseTitle('Physique TD2 | TD | LEROY Anne')).toMatchObject({ name: 'Physique', kind: 'TD' });
    expect(courseName('Comptabilité | Examen | PETIT Luc')).toBe('Comptabilité');
    expect(parseCourseTitle('Maths - TD')).toEqual({ name: 'Maths', kind: null, teacher: null });
  });

  it('reconnaît un agenda d’emploi du temps', () => {
    const timed = (title: string) => ({ title, allDay: false });
    const piped = ['A | Cours | X', 'B |  | Y', 'C | TD | Z', 'A | Cours | X', 'D | Examen | W'].map(timed);
    expect(looksLikeTimetable(piped)).toBe(true);
    expect(looksLikeTimetable(piped.slice(0, 4))).toBe(false);
    // Moins de 60 % : un agenda personnel qui aurait quelques « | ».
    expect(looksLikeTimetable([...piped, ...['Dentiste', 'Sport', 'Courses', 'Ciné', 'Repas'].map(timed)])).toBe(false);
    // Les journées entières (jours fériés…) ne comptent pas.
    expect(looksLikeTimetable([...piped, { title: 'Jour férié |  | ', allDay: true }, { title: 'Pont', allDay: true }])).toBe(true);
    // Second indice : le nom de l'agenda.
    expect(['Emploi du temps', 'EDT M1', 'Mon emploi du temps', 'Timetable'].every(isTimetableName)).toBe(true);
    expect(['Famille', 'Jours fériés et autres fêtes en France', 'Perso', 'Medtech'].some(isTimetableName)).toBe(false);
  });

  it('crée les matières toutes seules, relie les cours, et ouvre les devoirs au cours suivant', async () => {
    const { db } = createTestDb();
    await db.batch([sql`INSERT INTO subjects (id, name, color, sort_order, created_at, updated_at) VALUES ('fr', 'Francais', 'red', 1, ${NOW}, ${NOW})`]);
    const school: RemoteCalendar = { id: 'cours@import.calendar.google.com', name: 'Intranet', color: '#4986e7', primary: false, selected: true };
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
    expect(await nextCourseOccurrence(db, 'Maths', '2026-11-26T08:00')).toEqual({ itemId: `${school.id}|c2`, startsAt: '2026-11-27T10:00' });
    expect(await nextCourseOccurrence(db, 'Maths', '2026-11-27T10:00')).toBeUndefined();

    const agenda = (await listAgenda(db, TODAY, '2026-11-28')).filter((i) => i.source === 'google');
    // Un cours s'affiche sous son nom ramené, pas sous l'intitulé brut.
    const cm = agenda.find((i) => i.id === `${school.id}|c1`)!;
    expect(cm.title).toBe('Maths');
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
    // Un ancien devoir (sans cours précis) de la matière, à rendre ce jour-là, est attendu pour ce cours.
    expect(await homeworkForCourse(db, `${school.id}|c2`, maths.id, '2026-11-27')).toEqual([{ id: 'h1', title: 'Exercices p. 42', status: 'todo' }]);
    // Les cours ne déclenchent pas le rappel « Rendez-vous ».
    expect(await listTimedEventsBetween(db, '2026-11-26T07:50', '2026-11-26T08:05')).toEqual([]);
  });
});

describe('Google Agenda : emploi du temps reconnu seul et devoirs reliés à un cours', () => {
  const perso: RemoteCalendar = { id: 'moi@gmail.com', name: 'Perso', color: '#16a765', primary: true, selected: true };
  const school: RemoteCalendar = { id: 'edt@import.calendar.google.com', name: 'Emploi du temps', color: '#4986e7', primary: false, selected: true };
  const course = (id: string, title: string, day: string, hour = '09') =>
    remoteEvent({ id, title, start: `${day}T${hour}:00:00+01:00`, end: `${day}T${hour === '09' ? '11' : '16'}:00:00+01:00` });
  const timetable = (moved = false): RemoteEvent[] => [
    course('m1', 'Machine Learning |  | DUPONT Marie ', '2026-11-26'),
    course('m2', 'Machine Learning |  | DUPONT Marie ', moved ? '2026-12-04' : '2026-12-03'),
    course('r1', 'Réseaux | Cours | MARTIN Paul {ecole}', '2026-11-27'),
    course('r2', 'Réseaux | Cours | MARTIN Paul {ecole}', '2026-12-04'),
    course('x1', 'Comptabilité | Examen | PETIT Luc', '2026-11-30', '14'),
    remoteEvent({ id: 'f1', title: 'Jour Férié |  |  ', allDay: true, start: '2026-12-25', end: '2026-12-26' }),
  ];
  const source = (moved = false): GoogleSource => ({
    calendars: async () => [perso, school],
    events: async (calendarId) => (calendarId === school.id ? timetable(moved) : [remoteEvent({ id: 'p1', title: 'Dentiste' })]),
  });

  it('reconnaît l’agenda des cours et crée les matières sous un nom propre', async () => {
    const { db } = createTestDb();
    await syncGoogle(db, source(), TODAY, 'Europe/Paris', NOW);
    expect((await listGoogleCalendars(db)).map((c) => [c.name, c.isSchool])).toEqual([
      ['Perso', false],
      ['Emploi du temps', true],
    ]);
    expect((await db.query<{ name: string }>('SELECT name FROM subjects ORDER BY name')).map((s) => s.name)).toEqual([
      'Comptabilité',
      'Machine Learning',
      'Réseaux',
    ]);
    const exam = (await listCoursesBetween(db, '2026-11-30', '2026-12-01'))[0]!;
    expect(exam).toMatchObject({ course: 'Comptabilité', courseKind: 'Examen', teacher: 'PETIT Luc', homeworkOpen: 0 });
    // Le jour férié (journée entière) n'est pas un cours.
    expect(await db.query("SELECT course FROM google_events WHERE id = 'f1'")).toEqual([{ course: null }]);
    const agenda = await listAgenda(db, '2026-11-26', '2026-12-01');
    const titles = agenda.filter((i) => i.kind === 'class').map((i) => i.title);
    expect(titles).toEqual(['Machine Learning', 'Réseaux', 'Comptabilité · Examen']);
    // Les cours appartiennent au mode Cours : le dashboard Travail (qui écarte isSchoolItem) ne les montre
    // plus, il garde les événements de l'agenda perso ; « Prochains jours » du mode Cours les montre.
    expect(agenda.filter((i) => !isSchoolItem(i)).map((i) => i.title)).toEqual(['Dentiste']);
    expect(schoolUpcomingItems(agenda, '2026-11-26').map((i) => i.title)).toEqual(['Réseaux', 'Dentiste', 'Comptabilité · Examen']);
  });

  it('ne reconnaît plus seul l’agenda des cours une fois choisi à la main', async () => {
    const { db } = createTestDb();
    await db.batch([setSettingStatement(SCHOOL_MANUAL_SETTING, true)]);
    await syncGoogle(db, source(), TODAY, 'Europe/Paris', NOW);
    expect((await listGoogleCalendars(db)).some((c) => c.isSchool)).toBe(false);
    expect(await db.query('SELECT id FROM subjects')).toEqual([]);
  });

  it('relie un devoir à un cours précis, qui le suit s’il change de jour', async () => {
    const { db } = createTestDb();
    await syncGoogle(db, source(), TODAY, 'Europe/Paris', NOW);
    const [ml] = await listCoursesBetween(db, '2026-12-03', '2026-12-04');
    expect(ml).toMatchObject({ itemId: `${school.id}|m2`, course: 'Machine Learning' });
    const base = { projectId: null, scheduledDate: null, priority: 1 as const, estimateMin: null, notes: null };
    await db.batch([
      insertTaskStatement('h1', { ...base, title: 'TP noté', subjectId: ml!.subjectId, courseEvent: ml!.itemId, dueDate: '2026-12-03' }, NOW),
      insertTaskStatement('h2', { ...base, title: 'Relire le cours', subjectId: ml!.subjectId, courseEvent: ml!.itemId, dueDate: '2026-12-03' }, NOW),
      sql`UPDATE tasks SET status = 'done', completed_at = ${NOW} WHERE id = 'h2'`,
    ]);
    expect((await listCoursesBetween(db, '2026-12-03', '2026-12-04'))[0]?.homeworkOpen).toBe(1);
    expect(await homeworkForCourse(db, ml!.itemId, ml!.subjectId, '2026-12-03')).toEqual([
      { id: 'h1', title: 'TP noté', status: 'todo' },
      { id: 'h2', title: 'Relire le cours', status: 'done' },
    ]);
    // L'occurrence d'avant propose ce cours-ci comme le suivant.
    expect(await nextCourseOccurrence(db, 'Machine Learning', '2026-11-26T09:00')).toMatchObject({ itemId: ml!.itemId });

    // Le cours passe au 4 décembre dans Google : le devoir à faire suit, pas celui déjà fait.
    await syncGoogle(db, source(true), TODAY, 'Europe/Paris', NOW);
    expect(await db.query('SELECT id, due_date, course_event FROM tasks ORDER BY id')).toEqual([
      { id: 'h1', dueDate: '2026-12-04', courseEvent: ml!.itemId },
      { id: 'h2', dueDate: '2026-12-03', courseEvent: ml!.itemId },
    ]);
  });
});
