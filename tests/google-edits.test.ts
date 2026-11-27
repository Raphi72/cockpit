import { describe, expect, it } from 'vitest';
import { listAgenda } from '@/domains/agenda/repository';
import {
  changedFields,
  googleEventId,
  googleTimes,
  insertPayload,
  parseWriteError,
  patchPayload,
  seriesRetime,
  type EventContent,
  type GoogleEdit,
} from '@/domains/google/edits/model';
import { listEdits } from '@/domains/google/edits/repository';
import { pushEdits, reapplyEdits, recordEdit, undoEdit, type GoogleWriter } from '@/domains/google/edits/service';
import type { RemoteCalendar, RemoteEvent } from '@/domains/google/model';
import { syncGoogle, type GoogleSource } from '@/domains/google/service';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
const TODAY = '2026-11-26';
const TZ = 'Europe/Paris';

const dentist: EventContent = {
  title: 'Dentiste',
  location: 'Lyon',
  notes: null,
  startsAt: '2026-11-27T10:00',
  endsAt: '2026-11-27T11:00',
  allDay: false,
  projectId: null,
  subjectId: null,
};

const edit = (patch: Partial<GoogleEdit>): GoogleEdit => ({
  id: '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0',
  calendarId: 'perso',
  eventId: 'e1',
  seriesId: null,
  op: 'patch',
  scope: 'this',
  fields: [],
  status: 'pending',
  error: null,
  createdAt: NOW,
  ...patch,
});

const calendars: RemoteCalendar[] = [
  { id: 'perso', name: 'Perso', color: '#16a765', primary: true, selected: true, writable: true },
  { id: 'cours', name: 'Intranet', color: '#4986e7', primary: false, selected: true, writable: false },
];

const remote = (patch: Partial<RemoteEvent>): RemoteEvent => ({
  id: 'e1',
  title: 'Dentiste',
  location: 'Lyon',
  start: '2026-11-27T10:00:00+01:00',
  end: '2026-11-27T11:00:00+01:00',
  allDay: false,
  htmlLink: null,
  ...patch,
});

/** Google, tel que la relecture le voit : modifiable entre deux relectures. */
function fakeGoogle(events: Record<string, RemoteEvent[]>): GoogleSource {
  return { calendars: async () => calendars, events: async (calendarId) => events[calendarId] ?? [] };
}

/** Un faux Google qui note ce qu'on lui envoie, ou refuse comme le dit `fail`. */
function fakeWriter(fail?: (call: string) => string | null): GoogleWriter & { calls: string[] } {
  const calls: string[] = [];
  const run = async (call: string) => {
    const error = fail?.(call);
    if (error) throw new Error(error);
    calls.push(call);
  };
  return {
    calls,
    insert: (calendarId, event) => run(`insert ${calendarId} ${String(event.id)}`),
    patch: (calendarId, eventId, patch) => run(`patch ${calendarId} ${eventId} ${Object.keys(patch).sort().join(',')}`),
    remove: (calendarId, eventId) => run(`delete ${calendarId} ${eventId}`),
    retime: (calendarId, seriesId, startTime, endTime) => run(`retime ${calendarId} ${seriesId} ${startTime}-${endTime}`),
  };
}

describe('Google en écriture : règles', () => {
  it('donne à une création un identifiant que Google accepte, le même partout', () => {
    const id = googleEventId('0B1C2D3E-4F50-6172-8394-A5B6C7D8E9F0');
    expect(id).toBe('cockpit0b1c2d3e4f5061728394a5b6c7d8e9f0');
    // Base32hex de Google : chiffres et lettres de a à v.
    expect(/^[0-9a-v]{5,1024}$/.test(id)).toBe(true);
  });

  it('écrit les moments comme Google les attend', () => {
    expect(googleTimes(dentist, TZ)).toEqual({
      start: { dateTime: '2026-11-27T10:00:00', timeZone: TZ, date: null },
      end: { dateTime: '2026-11-27T11:00:00', timeZone: TZ, date: null },
    });
    // Une journée entière finit le lendemain du dernier jour ; sans fin, une heure de durée.
    expect(googleTimes({ startsAt: '2026-12-21', endsAt: '2027-01-03', allDay: true }, TZ)).toEqual({
      start: { date: '2026-12-21', dateTime: null },
      end: { date: '2027-01-04', dateTime: null },
    });
    expect(googleTimes({ startsAt: '2026-11-27T23:30', endsAt: null, allDay: false }, TZ).end.dateTime).toBe('2026-11-27T23:59:00');
  });

  it("n'envoie que ce qui a changé, et l'heure d'une série à part", () => {
    const moved = { ...dentist, startsAt: '2026-11-27T14:00', endsAt: '2026-11-27T15:00' };
    expect(changedFields(dentist, moved)).toEqual(['time']);
    expect(changedFields(dentist, { ...dentist, location: 'Lyon', notes: '' })).toEqual([]);
    expect(changedFields(dentist, { ...dentist, title: 'Orthodontiste', projectId: 'p1' })).toEqual(['title', 'link']);
    expect(Object.keys(patchPayload(edit({ ...moved, fields: ['time'] }), TZ)).sort()).toEqual(['end', 'start']);
    const series = edit({ ...moved, seriesId: 's1', scope: 'all', fields: ['time', 'title'], title: 'Cours de piano' });
    expect(Object.keys(patchPayload(series, TZ))).toEqual(['summary']);
    expect(seriesRetime(series)).toEqual({ startTime: '14:00', endTime: '15:00' });
    const payload = insertPayload({ ...edit({ op: 'insert', eventId: 'cockpitabc' }), ...dentist, projectId: 'p1' }, TZ);
    expect(payload).toMatchObject({ id: 'cockpitabc', summary: 'Dentiste', extendedProperties: { private: { cockpitProjectId: 'p1', cockpitSubjectId: '' } } });
    expect(insertPayload({ ...edit({ op: 'insert' }), ...dentist, recurrence: 'FREQ=WEEKLY' }, TZ).recurrence).toEqual(['RRULE:FREQ=WEEKLY']);
  });

  it('lit les refus de Google tels que Rust les dit', () => {
    expect(parseWriteError('offline|Google injoignable')).toEqual({ kind: 'offline', message: 'Google injoignable' });
    expect(parseWriteError(new Error('denied|Droit manquant'))).toEqual({ kind: 'denied', message: 'Droit manquant' });
    expect(parseWriteError('autre chose')).toEqual({ kind: 'error', message: 'autre chose' });
  });
});

describe('Google en écriture : copie locale, relecture, envoi', () => {
  it('montre une modification tout de suite, et après chaque relecture tant qu’elle attend', async () => {
    const { db } = createTestDb();
    const google = fakeGoogle({ perso: [remote({})], cours: [remote({ id: 'c1', title: 'Maths', location: 'B204' })] });
    await syncGoogle(db, google, TODAY, TZ, NOW);

    await recordEdit(db, edit({ ...dentist, startsAt: '2026-11-27T14:00', endsAt: '2026-11-27T15:00', fields: ['time'] }), NOW);
    await recordEdit(db, edit({ id: 'r1', calendarId: 'cours', eventId: 'c1', status: 'local', location: 'Amphi A', fields: ['location'] }), NOW);
    const shown = async () =>
      (await listAgenda(db, TODAY, '2026-12-01')).filter((i) => i.source === 'google').map((i) => [i.title, i.start, i.detail]);
    expect(await shown()).toEqual([
      ['Maths', '2026-11-27T10:00', 'Amphi A'],
      ['Dentiste', '2026-11-27T14:00', 'Lyon'],
    ]);
    // Une relecture (Google n'a encore rien reçu) : les deux tiennent toujours.
    await syncGoogle(db, google, TODAY, TZ, NOW);
    expect(await shown()).toEqual([
      ['Maths', '2026-11-27T10:00', 'Amphi A'],
      ['Dentiste', '2026-11-27T14:00', 'Lyon'],
    ]);
  });

  it('envoie dans l’ordre, s’arrête hors ligne ou sans droit, garde un refus en retouche', async () => {
    const { db } = createTestDb();
    await syncGoogle(db, fakeGoogle({ perso: [remote({})] }), TODAY, TZ, NOW);
    await recordEdit(db, edit({ id: 'a', ...dentist, title: 'Orthodontiste', fields: ['title'] }), NOW);
    await recordEdit(db, edit({ id: 'b', op: 'insert', eventId: googleEventId('b'), ...dentist, createdAt: '2026-11-26T10:00:01.000Z' }), NOW);

    // Hors ligne : rien ne part, tout attend.
    const offline = fakeWriter(() => 'offline|Google injoignable');
    expect(await pushEdits(db, offline, TZ, NOW)).toEqual({ pushed: 0, blocked: { kind: 'offline', message: 'Google injoignable' } });
    expect((await listEdits(db, { statuses: ['pending'] })).length).toBe(2);

    // Google refuse la première (une erreur de contenu) : elle reste une retouche, la seconde part.
    const picky = fakeWriter((call) => (call.startsWith('patch') ? 'error|Titre refusé' : null));
    expect(await pushEdits(db, picky, TZ, NOW)).toEqual({ pushed: 1, blocked: null });
    expect(picky.calls).toEqual(['insert perso cockpitb']);
    const [kept] = await listEdits(db, { statuses: ['local'] });
    expect(kept).toMatchObject({ id: 'a', error: 'Titre refusé' });

    // Après la relecture, ce qui est parti ne sert plus ; la retouche reste appliquée.
    await syncGoogle(db, fakeGoogle({ perso: [remote({}), remote({ id: 'cockpitb' })] }), TODAY, TZ, NOW);
    expect((await listEdits(db, { statuses: ['done'] })).length).toBe(0);
    const titles = (await listAgenda(db, TODAY, '2026-12-01')).filter((i) => i.source === 'google').map((i) => i.title);
    expect(titles.sort()).toEqual(['Dentiste', 'Orthodontiste']);
  });

  it('défait une suppression : en attente, elle disparaît ; envoyée, l’événement est recréé', async () => {
    const { db } = createTestDb();
    await syncGoogle(db, fakeGoogle({ perso: [remote({})] }), TODAY, TZ, NOW);
    const count = async () => (await listAgenda(db, TODAY, '2026-12-01')).filter((i) => i.source === 'google').length;

    const undo = await recordEdit(db, edit({ op: 'delete' }), NOW);
    expect(await count()).toBe(0);
    await undoEdit(db, undo, NOW);
    expect(await count()).toBe(1);
    expect((await listEdits(db, { statuses: ['pending', 'local', 'done'] })).length).toBe(0);

    const again = await recordEdit(db, edit({ id: 'd2', op: 'delete' }), NOW);
    const writer = fakeWriter();
    await pushEdits(db, writer, TZ, NOW);
    expect(writer.calls).toEqual(['delete perso e1']);
    await undoEdit(db, again, NOW);
    const [recreate] = await listEdits(db, { statuses: ['pending'] });
    expect(recreate).toMatchObject({ op: 'insert', title: 'Dentiste', location: 'Lyon', startsAt: '2026-11-27T10:00' });
    expect(await count()).toBe(1);
  });

  it('ré-applique les modifications reçues de l’autre appareil', async () => {
    const { db } = createTestDb();
    await syncGoogle(db, fakeGoogle({ perso: [remote({})] }), TODAY, TZ, NOW);
    // Une modification arrivée par la synchronisation : notée, pas encore appliquée ici.
    await db.batch([
      {
        sql: `INSERT INTO google_edits (id, calendar_id, event_id, op, scope, fields, title, status, created_at, updated_at)
              VALUES ('x', 'perso', 'e1', 'patch', 'this', '["title"]', 'Contrôle', 'pending', ?, ?)`,
        params: [NOW, NOW],
      },
    ]);
    await reapplyEdits(db);
    const [item] = (await listAgenda(db, TODAY, '2026-12-01')).filter((i) => i.source === 'google');
    expect(item?.title).toBe('Contrôle');
  });
});
