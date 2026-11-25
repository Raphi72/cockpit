import { describe, expect, it, vi } from 'vitest';
import { sql } from '@/core/db/client';
import type { Db } from '@/core/db/types';
import { validateNewEvent, type NewEventInput } from '@/domains/agenda/model';
import type { Recurrence } from '@/domains/agenda/recurrence';
import {
  deleteEventStatement,
  getEvent,
  insertEventStatement,
  listAgenda,
  listExceptions,
  listProjectEvents,
  restoreEventStatement,
  updateEventStatement,
} from '@/domains/agenda/repository';
import { EXPORT_TABLES } from '@/domains/data/export/model';
import type { Moment } from '@/domains/notifications/model';
import { listDeadlinesSoon, listTimedEventsBetween } from '@/domains/notifications/repository';
import { collectNotices, runNotifications } from '@/domains/notifications/service';
import { searchEverything } from '@/domains/search/repository';
import { createTestDb, readMigrations } from './support/test-db';

const NOW = '2026-11-01T10:00:00.000Z';
// Novembre 2026 : le 2, le 9, le 16, le 23 et le 30 sont des lundis.
const NOVEMBER = { from: '2026-11-01', to: '2026-12-01' };

const weekly = (overrides: Partial<Recurrence> = {}): Recurrence => ({ freq: 'weekly', interval: 1, weekdays: [1], until: null, ...overrides });

const newEvent = (overrides: Partial<NewEventInput> = {}): NewEventInput => ({
  title: 'Sport',
  kind: 'personal',
  timing: { date: '2026-11-02', allDay: false, endDate: null, startTime: '18:00', endTime: '19:30' },
  location: 'Salle',
  notes: null,
  projectId: null,
  recurrence: weekly({ weekdays: [1, 3] }),
  ...overrides,
});

/** Un projet, pour les événements rattachés. */
async function setup(): Promise<Db> {
  const { db } = createTestDb();
  await db.batch([
    sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW})`,
  ]);
  return db;
}

const cancel = (eventId: string, occurrence: string) =>
  sql`INSERT INTO event_exceptions (id, event_id, occurrence, kind, created_at)
      VALUES (${`x-${occurrence}`}, ${eventId}, ${occurrence}, 'cancelled', ${NOW})`;

const move = (eventId: string, occurrence: string, startsAt: string, endsAt: string | null) =>
  sql`INSERT INTO event_exceptions (id, event_id, occurrence, kind, starts_at, ends_at, created_at)
      VALUES (${`x-${occurrence}`}, ${eventId}, ${occurrence}, 'moved', ${startsAt}, ${endsAt}, ${NOW})`;

const starts = async (db: Db, range = NOVEMBER) => (await listAgenda(db, range.from, range.to)).map((item) => item.start);

describe('règle stockée une fois (P15)', () => {
  it('garde la règle sur l’événement, au format RRULE', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent(), NOW)]);

    const event = (await getEvent(db, 'e1'))!;
    expect(event).toMatchObject({ startsAt: '2026-11-02T18:00', endsAt: '2026-11-02T19:30', recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE' });
    // Une seule ligne en base : les occurrences ne sont pas recopiées.
    expect(await db.query('SELECT id FROM events')).toHaveLength(1);

    await db.batch([updateEventStatement('e1', { recurrence: null }, NOW)]);
    expect((await getEvent(db, 'e1'))?.recurrence).toBeNull();
  });

  it('un événement sans répétition reste comme avant', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent({ recurrence: null }), NOW)]);
    expect((await getEvent(db, 'e1'))?.recurrence).toBeNull();
    const items = await listAgenda(db, NOVEMBER.from, NOVEMBER.to);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: 'event:e1:personal', start: '2026-11-02T18:00' });
    expect(items[0]!.occurrence).toBeUndefined();
  });

  it('refuse une répétition qui finit avant de commencer', () => {
    expect(validateNewEvent(newEvent())).toEqual({});
    expect(validateNewEvent(newEvent({ recurrence: weekly({ until: '2026-11-01' }) }))).toEqual({
      recurrence: 'La répétition se termine avant le début.',
    });
  });

  it('se supprime et revient avec sa règle (annulation)', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent(), NOW)]);
    const event = (await getEvent(db, 'e1'))!;
    await db.batch([deleteEventStatement('e1')]);
    expect(await starts(db)).toEqual([]);
    await db.batch([restoreEventStatement(event, NOW)]);
    expect(await getEvent(db, 'e1')).toEqual(event);
    expect(await starts(db)).toHaveLength(9);
  });
});

describe('agenda : occurrences calculées', () => {
  it('montre chaque occurrence de la plage, à son heure', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent({ projectId: 'p1' }), NOW)]);

    const items = await listAgenda(db, '2026-11-08', '2026-11-15');
    expect(items.map((i) => `${i.start} – ${i.end}`)).toEqual([
      '2026-11-09T18:00 – 2026-11-09T19:30',
      '2026-11-11T18:00 – 2026-11-11T19:30',
    ]);
    expect(items[0]).toMatchObject({
      key: 'event:e1:personal:2026-11-09',
      source: 'event',
      id: 'e1',
      kind: 'personal',
      title: 'Sport',
      detail: 'Salle',
      allDay: false,
      projectId: 'p1',
      color: 'blue',
      occurrence: '2026-11-09',
    });
    // Chaque occurrence a sa propre clé.
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });

  it('commence à la première occurrence et s’arrête à la fin de la règle', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent({ recurrence: weekly({ until: '2026-11-16' }) }), NOW)]);
    expect(await starts(db, { from: '2026-10-01', to: '2027-01-01' })).toEqual([
      '2026-11-02T18:00',
      '2026-11-09T18:00',
      '2026-11-16T18:00',
    ]);
    expect(await starts(db, { from: '2026-10-01', to: '2026-11-02' })).toEqual([]);
    expect(await starts(db, { from: '2026-11-17', to: '2027-01-01' })).toEqual([]);
  });

  it('se mêle aux autres événements dans l’ordre de la journée', async () => {
    const db = await setup();
    await db.batch([
      insertEventStatement('e1', newEvent({ recurrence: weekly() }), NOW),
      insertEventStatement(
        'e2',
        newEvent({
          title: 'Dentiste',
          timing: { date: '2026-11-09', allDay: false, endDate: null, startTime: '09:00', endTime: null },
          recurrence: null,
        }),
        NOW,
      ),
    ]);
    const items = await listAgenda(db, '2026-11-09', '2026-11-10');
    expect(items.map((i) => i.title)).toEqual(['Dentiste', 'Sport']);
  });

  it('une occurrence sur plusieurs jours déborde sur la plage suivante', async () => {
    const db = await setup();
    const stage = newEvent({
      title: 'Astreinte',
      timing: { date: '2026-11-06', allDay: true, endDate: '2026-11-08', startTime: null, endTime: null },
      recurrence: weekly({ weekdays: [5] }),
    });
    await db.batch([insertEventStatement('e1', stage, NOW)]);
    const items = await listAgenda(db, '2026-11-15', '2026-11-16');
    expect(items.map((i) => `${i.start} → ${i.end}`)).toEqual(['2026-11-13 → 2026-11-15']);
    expect(items[0]).toMatchObject({ allDay: true, occurrence: '2026-11-13' });
  });

  it('retire une occurrence annulée et montre une occurrence déplacée à sa nouvelle place', async () => {
    const db = await setup();
    await db.batch([
      insertEventStatement('e1', newEvent({ recurrence: weekly() }), NOW),
      cancel('e1', '2026-11-09'),
      move('e1', '2026-11-16', '2026-11-17T12:00', '2026-11-17T13:00'),
    ]);

    const items = await listAgenda(db, NOVEMBER.from, NOVEMBER.to);
    expect(items.map((i) => i.start)).toEqual(['2026-11-02T18:00', '2026-11-17T12:00', '2026-11-23T18:00', '2026-11-30T18:00']);
    // L'occurrence déplacée garde son identité : le jour prévu par la règle.
    expect(items[1]).toMatchObject({ key: 'event:e1:personal:2026-11-16', occurrence: '2026-11-16', end: '2026-11-17T13:00' });

    const exceptions = await listExceptions(db, ['e1']);
    expect(exceptions.get('e1')?.map((x) => `${x.occurrence}:${x.kind}`)).toEqual(['2026-11-09:cancelled', '2026-11-16:moved']);
    expect(await listExceptions(db, [])).toEqual(new Map());
  });

  it('les exceptions partent avec l’événement', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent(), NOW), cancel('e1', '2026-11-09')]);
    await db.batch([deleteEventStatement('e1')]);
    expect(await db.query('SELECT id FROM event_exceptions')).toEqual([]);
  });

  it('refuse une exception incohérente', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent(), NOW), cancel('e1', '2026-11-09')]);
    // Une seule exception par occurrence.
    await expect(db.batch([cancel('e1', '2026-11-09')])).rejects.toThrow(/UNIQUE/);
    // Déplacée sans nouveau moment, ou annulée avec un moment.
    await expect(
      db.execute(
        `INSERT INTO event_exceptions (id, event_id, occurrence, kind, created_at) VALUES ('a', 'e1', '2026-11-11', 'moved', ?)`,
        [NOW],
      ),
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.execute(
        `INSERT INTO event_exceptions (id, event_id, occurrence, kind, starts_at, created_at)
         VALUES ('b', 'e1', '2026-11-11', 'cancelled', '2026-11-12T10:00', ?)`,
        [NOW],
      ),
    ).rejects.toThrow(/CHECK/);
  });
});

describe('fiche projet : prochains événements', () => {
  it('montre un événement qui se répète une fois, à sa prochaine occurrence', async () => {
    const db = await setup();
    await db.batch([
      insertEventStatement('e1', newEvent({ projectId: 'p1' }), NOW),
      insertEventStatement(
        'e2',
        newEvent({
          title: 'Livraison',
          projectId: 'p1',
          timing: { date: '2026-11-10', allDay: true, endDate: null, startTime: null, endTime: null },
          recurrence: null,
        }),
        NOW,
      ),
      cancel('e1', '2026-11-09'),
    ]);

    const events = await listProjectEvents(db, 'p1', '2026-11-05');
    expect(events.map((e) => `${e.title} ${e.startsAt}`)).toEqual(['Livraison 2026-11-10', 'Sport 2026-11-11T18:00']);
    expect(events[1]).toMatchObject({ id: 'e1', occurrence: '2026-11-11', endsAt: '2026-11-11T19:30' });
    expect(events[0]!.occurrence).toBeUndefined();
  });

  it('ne montre plus une série terminée', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent({ projectId: 'p1', recurrence: weekly({ until: '2026-11-09' }) }), NOW)]);
    expect(await listProjectEvents(db, 'p1', '2026-11-09')).toHaveLength(1);
    expect(await listProjectEvents(db, 'p1', '2026-11-10')).toEqual([]);
  });
});

describe('notifications', () => {
  const at = (today: string, time: string): Moment => ({ today, time });

  it('annonce chaque occurrence, une seule fois', async () => {
    const db = await setup();
    await db.batch([insertEventStatement('e1', newEvent({ recurrence: weekly() }), NOW)]);

    expect(await listTimedEventsBetween(db, '2026-11-09T17:45', '2026-11-09T18:00')).toEqual([
      { id: 'e1', title: 'Sport', startsAt: '2026-11-09T18:00', location: 'Salle' },
    ]);
    expect(await listTimedEventsBetween(db, '2026-11-10T17:45', '2026-11-10T18:00')).toEqual([]);

    const send = vi.fn(async (_notification: { title: string; body: string }) => undefined);
    const run = (today: string, time: string) => runNotifications(db, { moment: at(today, time), round: null, now: NOW }, send);
    expect(await run('2026-11-09', '17:45')).toBe(1);
    expect(await run('2026-11-09', '17:46')).toBe(0);
    // La semaine suivante : une nouvelle notification, pour la nouvelle occurrence.
    expect(await run('2026-11-16', '17:50')).toBe(1);
    expect(send.mock.calls.map(([n]) => n.body)).toEqual(['Dans 15 minutes, à 18:00 · Salle', 'Dans 10 minutes, à 18:00 · Salle']);
  });

  it('suit une occurrence déplacée, et oublie une occurrence annulée', async () => {
    const db = await setup();
    await db.batch([
      insertEventStatement('e1', newEvent({ recurrence: weekly() }), NOW),
      cancel('e1', '2026-11-09'),
      move('e1', '2026-11-16', '2026-11-17T12:00', null),
    ]);
    expect(await listTimedEventsBetween(db, '2026-11-09T17:45', '2026-11-09T18:00')).toEqual([]);
    expect(await listTimedEventsBetween(db, '2026-11-16T17:45', '2026-11-16T18:00')).toEqual([]);
    expect((await listTimedEventsBetween(db, '2026-11-17T11:45', '2026-11-17T12:00')).map((e) => e.startsAt)).toEqual([
      '2026-11-17T12:00',
    ]);
  });

  it('un rendez-vous juste après minuit est annoncé la veille au soir', async () => {
    const db = await setup();
    const night = newEvent({
      timing: { date: '2026-11-03', allDay: false, endDate: null, startTime: '00:05', endTime: null },
      recurrence: weekly({ weekdays: [2] }),
    });
    await db.batch([insertEventStatement('e1', night, NOW)]);
    expect((await listTimedEventsBetween(db, '2026-11-09T23:55', '2026-11-10T00:10')).map((e) => e.startsAt)).toEqual([
      '2026-11-10T00:05',
    ]);
  });

  it('rappelle une échéance qui se répète à chacune de ses occurrences', async () => {
    const db = await setup();
    const urssaf = newEvent({
      title: 'Déclaration URSSAF',
      kind: 'deadline',
      timing: { date: '2026-11-30', allDay: true, endDate: null, startTime: null, endTime: null },
      location: null,
      recurrence: { freq: 'monthly', interval: 1, weekdays: [], until: null },
    });
    await db.batch([insertEventStatement('e1', urssaf, NOW)]);

    expect(await listDeadlinesSoon(db, '2026-11-27')).toEqual([
      { source: 'event', id: 'e1', title: 'Déclaration URSSAF', date: '2026-11-30' },
    ]);
    expect(await listDeadlinesSoon(db, '2026-11-20')).toEqual([]);
    const keys = async (today: string) => (await collectNotices(db, at(today, '09:00'), 'launch')).map((n) => n.key);
    expect(await keys('2026-11-27')).toEqual(['event-deadline:e1:2026-11-30:J-3']);
    expect(await keys('2026-12-30')).toEqual(['event-deadline:e1:2026-12-30:J']);
  });
});

describe('recherche et export', () => {
  it('trouve un événement qui se répète, sans date et jamais « passé »', async () => {
    const db = await setup();
    await db.batch([
      insertEventStatement('e1', newEvent(), NOW),
      insertEventStatement('e2', newEvent({ title: 'Sport exceptionnel', recurrence: null }), NOW),
    ]);
    const results = await searchEverything(db, 'sport', '2027-06-01');
    expect(results.find((r) => r.id === 'e1')).toMatchObject({ entity: 'event', date: null, closed: false });
    expect(results.find((r) => r.id === 'e2')).toMatchObject({ date: '2026-11-02T18:00', closed: true });
  });

  it('exporte les exceptions, après les événements', () => {
    const keys = EXPORT_TABLES.map((t) => t.key);
    expect(keys.indexOf('eventExceptions')).toBe(keys.indexOf('events') + 1);
  });
});

describe('migration 0007', () => {
  it('laisse les événements existants sans répétition', async () => {
    const { db, raw } = createTestDb({ migrations: 6 });
    await db.batch([
      sql`INSERT INTO events (id, title, kind, all_day, starts_at, created_at, updated_at)
          VALUES ('e1', 'Dentiste', 'appointment', 0, '2026-11-09T09:00', ${NOW}, ${NOW})`,
    ]);
    raw.exec(readMigrations()[6]!);

    expect(await getEvent(db, 'e1')).toMatchObject({ title: 'Dentiste', recurrence: null });
    expect(await starts(db)).toEqual(['2026-11-09T09:00']);
    expect(await db.query('SELECT id FROM event_exceptions')).toEqual([]);
  });
});
