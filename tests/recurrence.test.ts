import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  expandSeries,
  formatRecurrence,
  isOccurrenceDay,
  moveRecurrenceStart,
  nextOccurrence,
  normalizeRecurrence,
  occurrenceDays,
  parseRecurrence,
  presetOf,
  recurrenceLabel,
  toggleWeekday,
  validateRecurrence,
  weekdayChoices,
  weekdayOf,
  type EventException,
  type Recurrence,
} from '@/domains/agenda/recurrence';

const rule = (overrides: Partial<Recurrence>): Recurrence => ({ freq: 'weekly', interval: 1, weekdays: [], until: null, ...overrides });

// Repères de novembre 2026 : le 2, le 9, le 16, le 23 et le 30 sont des lundis.
const MONDAY = '2026-11-02';

describe('format RRULE', () => {
  it('écrit la règle au format de la norme', () => {
    expect(formatRecurrence(rule({ freq: 'daily' }))).toBe('FREQ=DAILY');
    expect(formatRecurrence(rule({ weekdays: [5, 1, 3] }))).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(formatRecurrence(rule({ interval: 2, weekdays: [2], until: '2027-06-30' }))).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;UNTIL=20270630',
    );
    expect(formatRecurrence(rule({ freq: 'monthly' }))).toBe('FREQ=MONTHLY');
    // Le dimanche vient en dernier : la semaine de la norme commence le lundi.
    expect(formatRecurrence(rule({ weekdays: [0, 6] }))).toBe('FREQ=WEEKLY;BYDAY=SA,SU');
  });

  it('relit ce qu’elle écrit', () => {
    const rules = [
      rule({ freq: 'daily' }),
      rule({ weekdays: [1, 3, 5] }),
      rule({ interval: 2, weekdays: [2], until: '2027-06-30' }),
      rule({ freq: 'monthly', until: '2026-12-31' }),
      rule({ freq: 'yearly' }),
    ];
    for (const r of rules) expect(parseRecurrence(formatRecurrence(r))).toEqual(r);
    expect(parseRecurrence('RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=mo')).toEqual(rule({ weekdays: [1] }));
    expect(parseRecurrence('FREQ=DAILY;UNTIL=20270630T215959Z')?.until).toBe('2027-06-30');
  });

  it('refuse ce qu’elle ne comprend pas, plutôt que de se tromper', () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence('')).toBeNull();
    expect(parseRecurrence('INTERVAL=2')).toBeNull();
    expect(parseRecurrence('FREQ=HOURLY')).toBeNull();
    expect(parseRecurrence('FREQ=DAILY;COUNT=10')).toBeNull();
    expect(parseRecurrence('FREQ=MONTHLY;BYDAY=2TU')).toBeNull();
    expect(parseRecurrence('FREQ=MONTHLY;BYDAY=MO')).toBeNull();
    expect(parseRecurrence('FREQ=WEEKLY;INTERVAL=0')).toBeNull();
    expect(parseRecurrence('FREQ=WEEKLY;UNTIL=20271340')).toBeNull();
    expect(parseRecurrence('FREQ=WEEKLY;WKST=SU')).toBeNull();
  });
});

describe('jours d’une série', () => {
  it('connaît le jour de la semaine', () => {
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(weekdayOf('1969-12-28')).toBe(0);
    expect(weekdayOf('2028-02-29')).toBe(2);
  });

  it('chaque jour, ou tous les N jours', () => {
    expect(occurrenceDays(MONDAY, rule({ freq: 'daily' }), '2026-11-01', '2026-11-05')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(occurrenceDays(MONDAY, rule({ freq: 'daily', interval: 3 }), '2026-11-01', '2026-11-12')).toEqual([
      '2026-11-02',
      '2026-11-05',
      '2026-11-08',
      '2026-11-11',
    ]);
  });

  it('chaque semaine, le jour du début quand aucun jour n’est précisé', () => {
    expect(occurrenceDays(MONDAY, rule({}), '2026-11-01', '2026-12-01')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('plusieurs jours par semaine, jamais avant le début', () => {
    const sport = rule({ weekdays: [1, 3, 5] });
    // Commencée un mercredi : le lundi de cette semaine-là est passé.
    expect(occurrenceDays('2026-11-04', sport, '2026-11-01', '2026-11-15')).toEqual([
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
    ]);
  });

  it('une semaine sur deux, du lundi au dimanche (semaines A et B)', () => {
    const weekA = rule({ interval: 2, weekdays: [1, 0] });
    expect(occurrenceDays(MONDAY, weekA, '2026-11-01', '2026-12-01')).toEqual([
      '2026-11-02',
      '2026-11-08', // le dimanche de la même semaine
      '2026-11-16',
      '2026-11-22',
      '2026-11-30',
    ]);
    // À cheval sur le changement d'heure et sur l'année : toujours 14 jours d'écart.
    expect(occurrenceDays('2026-10-19', rule({ interval: 2 }), '2026-10-19', '2026-11-20')).toEqual([
      '2026-10-19',
      '2026-11-02',
      '2026-11-16',
    ]);
    expect(occurrenceDays('2026-12-21', rule({ interval: 2 }), '2026-12-21', '2027-01-20')).toEqual([
      '2026-12-21',
      '2027-01-04',
      '2027-01-18',
    ]);
  });

  it('chaque mois : un mois sans ce quantième est sauté', () => {
    expect(occurrenceDays('2026-11-30', rule({ freq: 'monthly' }), '2026-11-01', '2027-04-01')).toEqual([
      '2026-11-30',
      '2026-12-30',
      '2027-01-30',
      // pas de 30 février
      '2027-03-30',
    ]);
    expect(occurrenceDays('2026-10-31', rule({ freq: 'monthly' }), '2026-10-01', '2027-02-01')).toEqual([
      '2026-10-31',
      '2026-12-31',
      '2027-01-31',
    ]);
  });

  it('chaque année, le 29 février seulement les années bissextiles', () => {
    expect(occurrenceDays('2026-11-25', rule({ freq: 'yearly' }), '2026-01-01', '2029-01-01')).toEqual([
      '2026-11-25',
      '2027-11-25',
      '2028-11-25',
    ]);
    const leap = rule({ freq: 'yearly' });
    expect(isOccurrenceDay('2028-02-29', leap, '2032-02-29')).toBe(true);
    expect(isOccurrenceDay('2028-02-29', leap, '2029-02-28')).toBe(false);
    expect(isOccurrenceDay('2028-02-29', leap, '2029-03-01')).toBe(false);
  });

  it('s’arrête à la date de fin, incluse', () => {
    const until = rule({ until: '2026-11-16' });
    expect(occurrenceDays(MONDAY, until, '2026-11-01', '2026-12-01')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(occurrenceDays(MONDAY, until, '2026-12-01', '2027-01-01')).toEqual([]);
    expect(isOccurrenceDay(MONDAY, until, '2026-11-23')).toBe(false);
    expect(isOccurrenceDay(MONDAY, until, '2026-10-26')).toBe(false);
  });
});

describe('occurrences d’un événement', () => {
  const sport = { startsAt: '2026-11-02T18:00', endsAt: '2026-11-02T19:30', recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE' };
  const exception = (overrides: Partial<EventException>): EventException => ({
    eventId: 'e1',
    occurrence: '2026-11-09',
    kind: 'cancelled',
    startsAt: null,
    endsAt: null,
    ...overrides,
  });

  it('un événement sans règle n’a qu’une occurrence : lui-même', () => {
    const once = { startsAt: '2026-11-02T18:00', endsAt: null, recurrence: null };
    expect(expandSeries(once, [], '2026-11-01', '2026-12-01')).toEqual([
      { day: '2026-11-02', startsAt: '2026-11-02T18:00', endsAt: null },
    ]);
    expect(expandSeries(once, [], '2026-11-03', '2026-12-01')).toEqual([]);
    // Une règle incomprise ne répète rien.
    expect(expandSeries({ ...once, recurrence: 'FREQ=DAILY;COUNT=3' }, [], '2026-11-01', '2026-12-01')).toHaveLength(1);
  });

  it('chaque occurrence garde l’heure et la durée de la première', () => {
    expect(expandSeries(sport, [], '2026-11-08', '2026-11-12')).toEqual([
      { day: '2026-11-09', startsAt: '2026-11-09T18:00', endsAt: '2026-11-09T19:30' },
      { day: '2026-11-11', startsAt: '2026-11-11T18:00', endsAt: '2026-11-11T19:30' },
    ]);
  });

  it('une occurrence sur plusieurs jours compte dès qu’elle touche la plage', () => {
    const stage = { startsAt: '2026-11-02', endsAt: '2026-11-04', recurrence: 'FREQ=WEEKLY' };
    expect(expandSeries(stage, [], '2026-11-11', '2026-11-13')).toEqual([
      { day: '2026-11-09', startsAt: '2026-11-09', endsAt: '2026-11-11' },
    ]);
    expect(expandSeries(stage, [], '2026-11-12', '2026-11-16')).toEqual([]);
  });

  it('retire les occurrences annulées', () => {
    const days = expandSeries(sport, [exception({})], '2026-11-08', '2026-11-12').map((o) => o.day);
    expect(days).toEqual(['2026-11-11']);
  });

  it('montre une occurrence déplacée à sa nouvelle place, et plus à l’ancienne', () => {
    const moved = exception({ kind: 'moved', startsAt: '2026-11-10T12:00', endsAt: '2026-11-10T13:00' });
    expect(expandSeries(sport, [moved], '2026-11-08', '2026-11-12')).toEqual([
      { day: '2026-11-09', startsAt: '2026-11-10T12:00', endsAt: '2026-11-10T13:00' },
      { day: '2026-11-11', startsAt: '2026-11-11T18:00', endsAt: '2026-11-11T19:30' },
    ]);
    // Déplacée hors de la plage : elle n'y est plus du tout ; déplacée dans la plage depuis l'extérieur : elle y arrive.
    const far = exception({ kind: 'moved', startsAt: '2026-12-01T18:00', endsAt: null });
    expect(expandSeries(sport, [far], '2026-11-09', '2026-11-10')).toEqual([]);
    expect(expandSeries(sport, [far], '2026-12-01', '2026-12-02').map((o) => o.day)).toEqual(['2026-11-09']);
  });

  it('ignore une exception dont le jour n’est plus dans la règle', () => {
    const stale = exception({ occurrence: '2026-11-10', kind: 'moved', startsAt: '2026-11-12T08:00' });
    expect(expandSeries(sport, [stale], '2026-11-12', '2026-11-13')).toEqual([]);
  });

  it('trouve la prochaine occurrence, ou rien si la série est finie', () => {
    expect(nextOccurrence(sport, [], '2026-11-10')?.startsAt).toBe('2026-11-11T18:00');
    expect(nextOccurrence(sport, [exception({ occurrence: '2026-11-11' })], '2026-11-10')?.startsAt).toBe('2026-11-16T18:00');
    // Celle d'aujourd'hui compte encore, même si son heure est passée.
    expect(nextOccurrence(sport, [], '2026-11-09')?.day).toBe('2026-11-09');
    expect(nextOccurrence({ ...sport, recurrence: 'FREQ=WEEKLY;UNTIL=20261109' }, [], '2026-11-10')).toBeNull();
    // Loin dans le temps : le prochain 29 février.
    const leap = { startsAt: '2028-02-29', endsAt: null, recurrence: 'FREQ=YEARLY' };
    expect(nextOccurrence(leap, [], '2028-03-01')?.day).toBe('2032-02-29');
  });
});

describe('saisie de la répétition', () => {
  it('retrouve le choix du menu', () => {
    expect(presetOf(null)).toBe('none');
    expect(presetOf(rule({}))).toBe('weekly');
    expect(presetOf(rule({ interval: 2 }))).toBe('biweekly');
    expect(presetOf(rule({ freq: 'monthly' }))).toBe('monthly');
  });

  it('applique un choix du menu en gardant la fin, et les jours en hebdomadaire', () => {
    expect(applyPreset('none', rule({}), MONDAY)).toBeNull();
    expect(applyPreset('weekly', null, MONDAY)).toEqual(rule({ weekdays: [1] }));
    const sport = rule({ weekdays: [1, 3, 5], until: '2027-06-30' });
    expect(applyPreset('biweekly', sport, MONDAY)).toEqual({ ...sport, interval: 2 });
    expect(applyPreset('monthly', sport, MONDAY)).toEqual(rule({ freq: 'monthly', until: '2027-06-30' }));
    expect(applyPreset('weekly', rule({ freq: 'daily' }), '2026-11-04')).toEqual(rule({ weekdays: [3] }));
  });

  it('garde toujours coché le jour de la semaine du début', () => {
    const monday = rule({ weekdays: [1] });
    expect(toggleWeekday(monday, 1, MONDAY)).toEqual(monday);
    expect(toggleWeekday(monday, 5, MONDAY).weekdays).toEqual([1, 5]);
    expect(toggleWeekday(rule({ weekdays: [1, 5] }), 5, MONDAY).weekdays).toEqual([1]);
    expect(toggleWeekday(monday, 0, MONDAY).weekdays).toEqual([1, 0]);
    expect(normalizeRecurrence(rule({ weekdays: [5] }), MONDAY).weekdays).toEqual([1, 5]);
    expect(normalizeRecurrence(rule({ freq: 'daily', weekdays: [5] }), MONDAY).weekdays).toEqual([]);
  });

  it('suit un changement du premier jour', () => {
    // Un seul jour par semaine : il change avec la date.
    expect(moveRecurrenceStart(rule({ weekdays: [1] }), '2026-11-05')?.weekdays).toEqual([4]);
    // Plusieurs : le nouveau s'ajoute.
    expect(moveRecurrenceStart(rule({ weekdays: [1, 3] }), '2026-11-05')?.weekdays).toEqual([1, 3, 4]);
    expect(moveRecurrenceStart(rule({ freq: 'monthly' }), '2026-11-05')).toEqual(rule({ freq: 'monthly' }));
    expect(moveRecurrenceStart(null, '2026-11-05')).toBeNull();
  });

  it('refuse une fin avant le début', () => {
    expect(validateRecurrence(null, MONDAY)).toBeNull();
    expect(validateRecurrence(rule({ until: '2026-11-02' }), MONDAY)).toBeNull();
    expect(validateRecurrence(rule({ until: '2026-11-01' }), MONDAY)).toBe('La répétition se termine avant le début.');
  });

  it('propose les jours dans l’ordre de la semaine', () => {
    expect(weekdayChoices().map((c) => c.letter).join(' ')).toBe('L M M J V S D');
    expect(weekdayChoices(0).map((c) => c.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayChoices()[0]).toEqual({ weekday: 1, letter: 'L', name: 'lundi' });
  });

  it('dit la règle en clair', () => {
    const today = '2026-11-25';
    expect(recurrenceLabel(rule({ freq: 'daily' }), MONDAY, today)).toBe('Chaque jour');
    expect(recurrenceLabel(rule({ weekdays: [1, 3, 5] }), MONDAY, today)).toBe('Chaque semaine, le lundi, mercredi et vendredi');
    expect(recurrenceLabel(rule({ interval: 2 }), '2026-11-03', today)).toBe('Toutes les 2 semaines, le mardi');
    expect(recurrenceLabel(rule({ freq: 'monthly' }), '2026-11-30', today)).toBe('Chaque mois, le 30');
    expect(recurrenceLabel(rule({ freq: 'yearly', until: '2030-11-25' }), '2026-11-25', today)).toBe(
      'Chaque année, le 25 novembre, jusqu’au 25 nov. 2030',
    );
  });
});
