import { describe, expect, it } from 'vitest';
import type { Db } from '@/core/db/types';
import { movedAgendaItem, seriesChangeFromOccurrence, timingOf, type EventTiming, type NewEventInput } from '@/domains/agenda/model';
import { endSeriesBefore, occurrenceMoment, shiftSeriesDay, type Recurrence } from '@/domains/agenda/recurrence';
import { getEvent, getException, insertEventStatement, listAgenda, listExceptions, updateEventStatement } from '@/domains/agenda/repository';
import {
  buildCancelOccurrenceBatch,
  buildDeleteEventBatch,
  buildEndSeriesBatch,
  buildMoveOccurrenceBatch,
} from '@/domains/agenda/service';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-01T10:00:00.000Z';
// Novembre 2026 : le 2, le 9, le 16, le 23 et le 30 sont des lundis.
const NOVEMBER = { from: '2026-11-01', to: '2026-12-01' };

const weekly = (overrides: Partial<Recurrence> = {}): Recurrence => ({ freq: 'weekly', interval: 1, weekdays: [1], until: null, ...overrides });

const sport = (overrides: Partial<NewEventInput> = {}): NewEventInput => ({
  title: 'Sport',
  kind: 'personal',
  timing: { date: '2026-11-02', allDay: false, endDate: null, startTime: '18:00', endTime: '19:30' },
  location: null,
  notes: null,
  projectId: null,
  recurrence: weekly(),
  ...overrides,
});

let counter = 0;
const ctx = () => ({ now: NOW, today: '2026-11-01', newId: () => `x${++counter}` });

async function setup(input: NewEventInput = sport()) {
  const { db } = createTestDb();
  await db.batch([insertEventStatement('e1', input, NOW)]);
  return { db, event: (await getEvent(db, 'e1'))! };
}

const starts = async (db: Db, range = NOVEMBER) => (await listAgenda(db, range.from, range.to)).map((item) => item.start);

describe('moment d’une occurrence', () => {
  const series = { startsAt: '2026-11-02T18:00', endsAt: '2026-11-02T19:30', recurrence: 'FREQ=WEEKLY' };

  it('celui de la série, décalé à son jour', () => {
    expect(occurrenceMoment(series, [], '2026-11-16')).toEqual({
      startsAt: '2026-11-16T18:00',
      endsAt: '2026-11-16T19:30',
      moved: false,
    });
  });

  it('ou son nouveau moment, si elle a été déplacée', () => {
    const moved = { eventId: 'e1', occurrence: '2026-11-16', kind: 'moved' as const, startsAt: '2026-11-17T12:00', endsAt: null };
    expect(occurrenceMoment(series, [moved], '2026-11-16')).toEqual({ startsAt: '2026-11-17T12:00', endsAt: null, moved: true });
    expect(occurrenceMoment(series, [moved], '2026-11-23').moved).toBe(false);
  });
});

describe('cette fois seulement', () => {
  it('déplace une occurrence sans toucher à la série', async () => {
    const { db, event } = await setup();
    const batch = buildMoveOccurrenceBatch(event, '2026-11-16', { startsAt: '2026-11-17T12:00', endsAt: '2026-11-17T13:30' }, undefined, ctx());
    await db.batch(batch.statements);

    expect(await starts(db)).toEqual(['2026-11-02T18:00', '2026-11-09T18:00', '2026-11-17T12:00', '2026-11-23T18:00', '2026-11-30T18:00']);
    expect(await getEvent(db, 'e1')).toEqual(event);
    expect(await getException(db, 'e1', '2026-11-16')).toEqual({
      eventId: 'e1',
      occurrence: '2026-11-16',
      kind: 'moved',
      startsAt: '2026-11-17T12:00',
      endsAt: '2026-11-17T13:30',
    });

    // « Annuler » : elle retrouve sa place.
    await db.batch(batch.undo);
    expect(await starts(db)).toHaveLength(5);
    expect(await getException(db, 'e1', '2026-11-16')).toBeUndefined();
  });

  it('un second déplacement remplace le premier, et « Annuler » revient au premier', async () => {
    const { db, event } = await setup();
    await db.batch(buildMoveOccurrenceBatch(event, '2026-11-16', { startsAt: '2026-11-17T12:00', endsAt: null }, undefined, ctx()).statements);
    const previous = await getException(db, 'e1', '2026-11-16');
    const again = buildMoveOccurrenceBatch(event, '2026-11-16', { startsAt: '2026-11-18T08:00', endsAt: null }, previous, ctx());
    await db.batch(again.statements);
    expect((await getException(db, 'e1', '2026-11-16'))?.startsAt).toBe('2026-11-18T08:00');
    expect(await db.query('SELECT id FROM event_exceptions')).toHaveLength(1);

    await db.batch(again.undo);
    expect((await getException(db, 'e1', '2026-11-16'))?.startsAt).toBe('2026-11-17T12:00');
  });

  it('remise à sa place prévue, l’occurrence n’a plus d’exception', async () => {
    const { db, event } = await setup();
    await db.batch(buildMoveOccurrenceBatch(event, '2026-11-16', { startsAt: '2026-11-17T12:00', endsAt: null }, undefined, ctx()).statements);
    const previous = await getException(db, 'e1', '2026-11-16');
    const planned = { startsAt: '2026-11-16T18:00', endsAt: '2026-11-16T19:30' };
    const back = buildMoveOccurrenceBatch(event, '2026-11-16', planned, previous, ctx());
    await db.batch(back.statements);
    expect(await db.query('SELECT id FROM event_exceptions')).toEqual([]);
    await db.batch(back.undo);
    expect((await getException(db, 'e1', '2026-11-16'))?.kind).toBe('moved');
  });

  it('glissée dans le calendrier : même calcul que l’affichage immédiat', async () => {
    const { db, event } = await setup();
    const item = (await listAgenda(db, '2026-11-16', '2026-11-17'))[0]!;
    // Déposée deux jours plus tard, sur le créneau de 9 h : l'heure change, la durée reste.
    const moved = movedAgendaItem(item, 2, '09:00');
    await db.batch(buildMoveOccurrenceBatch(event, item.occurrence!, { startsAt: moved.start, endsAt: moved.end }, undefined, ctx()).statements);

    const after = (await listAgenda(db, '2026-11-18', '2026-11-19'))[0]!;
    expect(after).toMatchObject({ key: item.key, start: '2026-11-18T09:00', end: '2026-11-18T10:30', occurrence: '2026-11-16' });
  });

  it('supprime une occurrence, et « Annuler » la ramène', async () => {
    const { db } = await setup();
    const batch = buildCancelOccurrenceBatch('e1', '2026-11-09', undefined, ctx());
    await db.batch(batch.statements);
    expect(await starts(db)).toEqual(['2026-11-02T18:00', '2026-11-16T18:00', '2026-11-23T18:00', '2026-11-30T18:00']);
    await db.batch(batch.undo);
    expect(await starts(db)).toHaveLength(5);
  });

  it('supprimer une occurrence déplacée, puis annuler, la remet là où elle avait été déplacée', async () => {
    const { db, event } = await setup();
    await db.batch(buildMoveOccurrenceBatch(event, '2026-11-09', { startsAt: '2026-11-10T07:00', endsAt: null }, undefined, ctx()).statements);
    const previous = await getException(db, 'e1', '2026-11-09');
    const batch = buildCancelOccurrenceBatch('e1', '2026-11-09', previous, ctx());
    await db.batch(batch.statements);
    expect(await starts(db, { from: '2026-11-09', to: '2026-11-11' })).toEqual([]);
    await db.batch(batch.undo);
    expect(await starts(db, { from: '2026-11-09', to: '2026-11-11' })).toEqual(['2026-11-10T07:00']);
  });
});

describe('celle-ci et les suivantes', () => {
  it('arrête la série la veille', async () => {
    const { db, event } = await setup();
    expect(endSeriesBefore(weekly(), '2026-11-16').until).toBe('2026-11-15');

    const batch = buildEndSeriesBatch(event, '2026-11-16', NOW)!;
    await db.batch(batch.statements);
    expect(await starts(db, { from: '2026-11-01', to: '2027-06-01' })).toEqual(['2026-11-02T18:00', '2026-11-09T18:00']);
    expect((await getEvent(db, 'e1'))?.recurrence).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261115');

    await db.batch(batch.undo);
    expect((await getEvent(db, 'e1'))?.recurrence).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(await starts(db)).toHaveLength(5);
  });

  it('depuis la première occurrence, il ne resterait rien : à supprimer en entier', async () => {
    const { event } = await setup();
    expect(buildEndSeriesBatch(event, '2026-11-02', NOW)).toBeNull();
  });
});

describe('toute la série', () => {
  it('se supprime et revient avec ses exceptions (annulation)', async () => {
    const { db, event } = await setup();
    await db.batch([
      ...buildCancelOccurrenceBatch('e1', '2026-11-09', undefined, ctx()).statements,
      ...buildMoveOccurrenceBatch(event, '2026-11-16', { startsAt: '2026-11-17T12:00', endsAt: null }, undefined, ctx()).statements,
    ]);
    const before = await starts(db);
    const exceptions = (await listExceptions(db, ['e1'])).get('e1')!;

    const batch = buildDeleteEventBatch(event, exceptions, ctx());
    await db.batch(batch.statements);
    expect(await starts(db)).toEqual([]);
    expect(await db.query('SELECT id FROM event_exceptions')).toEqual([]);

    await db.batch(batch.undo);
    expect(await starts(db)).toEqual(before);
    expect((await listExceptions(db, ['e1'])).get('e1')).toEqual(exceptions);
  });

  it('remplace un jour de la semaine par un autre', () => {
    // Tous les lundis deviennent des mardis : le premier jour suit.
    expect(shiftSeriesDay(weekly(), '2026-11-02', '2026-11-16', '2026-11-17')).toEqual({
      start: '2026-11-03',
      rule: weekly({ weekdays: [2] }),
    });
    // Lundi, mercredi et vendredi, commencée un lundi : le mercredi passe au jeudi, le premier jour ne bouge pas.
    const three = weekly({ weekdays: [1, 3, 5] });
    expect(shiftSeriesDay(three, '2026-11-02', '2026-11-18', '2026-11-19')).toEqual({
      start: '2026-11-02',
      rule: weekly({ weekdays: [1, 4, 5] }),
    });
    // Déposé sur un jour déjà coché : il n'y est qu'une fois.
    expect(shiftSeriesDay(three, '2026-11-02', '2026-11-18', '2026-11-20').rule.weekdays).toEqual([1, 5]);
  });

  it('décale d’autant une série qui n’est pas hebdomadaire', () => {
    const monthly: Recurrence = { freq: 'monthly', interval: 1, weekdays: [], until: null };
    expect(shiftSeriesDay(monthly, '2026-11-30', '2026-12-30', '2026-12-28')).toEqual({ start: '2026-11-28', rule: monthly });
  });

  const occurrenceTiming = (date: string): EventTiming => ({ date, allDay: false, endDate: null, startTime: '18:00', endTime: '19:30' });

  it('changer l’heure d’une occurrence pour toute la série', async () => {
    const { db, event } = await setup();
    const current = occurrenceTiming('2026-11-16');
    const change = seriesChangeFromOccurrence(event, '2026-11-16', current, { ...current, startTime: '19:00', endTime: '20:00' });
    if ('error' in change) throw new Error(change.error);

    expect(change).toEqual({
      patch: { allDay: false, startsAt: '2026-11-02T19:00', endsAt: '2026-11-02T20:00', recurrence: 'FREQ=WEEKLY;BYDAY=MO' },
      occurrence: '2026-11-16',
    });
    await db.batch([updateEventStatement('e1', change.patch, NOW)]);
    expect(await starts(db, { from: '2026-11-09', to: '2026-11-24' })).toEqual(['2026-11-09T19:00', '2026-11-16T19:00', '2026-11-23T19:00']);
  });

  it('changer le jour d’une occurrence pour toute la série', async () => {
    const { db, event } = await setup();
    const change = seriesChangeFromOccurrence(event, '2026-11-16', occurrenceTiming('2026-11-16'), occurrenceTiming('2026-11-18'));
    if ('error' in change) throw new Error(change.error);

    // Tous les lundis passent au mercredi ; l'occurrence ouverte est désormais celle du 18.
    expect(change.occurrence).toBe('2026-11-18');
    await db.batch([updateEventStatement('e1', change.patch, NOW)]);
    expect(timingOf((await getEvent(db, 'e1'))!)).toMatchObject({ date: '2026-11-04', startTime: '18:00' });
    expect(await starts(db)).toEqual(['2026-11-04T18:00', '2026-11-11T18:00', '2026-11-18T18:00', '2026-11-25T18:00']);
  });

  it('refuse un résultat incohérent', async () => {
    const { event } = await setup(sport({ recurrence: weekly({ until: '2026-11-30' }) }));
    const current = occurrenceTiming('2026-11-16');
    expect(seriesChangeFromOccurrence(event, '2026-11-16', current, { ...current, endTime: '17:00' })).toEqual({
      error: 'La fin doit être après le début.',
    });
    // Décalée de dix semaines : la série commencerait après sa propre fin.
    expect(seriesChangeFromOccurrence(event, '2026-11-16', current, occurrenceTiming('2027-01-25'))).toEqual({
      error: 'La répétition se termine avant le début.',
    });
    const once = { ...event, recurrence: null };
    expect(seriesChangeFromOccurrence(once, '2026-11-16', current, current)).toEqual({ error: 'Cet événement ne se répète pas.' });
  });
});
