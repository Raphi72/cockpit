import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { isRetimed, movedAgendaItem, projectMoveProblem, snapTime, type AgendaItem } from '@/domains/agenda/model';
import { getEvent, insertEventStatement, listAgenda } from '@/domains/agenda/repository';
import { buildRetimeEventBatch, buildShiftBatch } from '@/domains/agenda/service';
import { getPaymentRow } from '@/domains/finance/payments/repository';
import { getProjectRow } from '@/domains/projects/repository';
import { getTask, insertTaskStatement } from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-25T10:00:00.000Z';

const item = (overrides: Partial<AgendaItem>): AgendaItem => ({
  key: 'k',
  source: 'event',
  id: 'e1',
  kind: 'appointment',
  title: 'Point',
  detail: null,
  start: '2026-09-25T14:00',
  end: '2026-09-25T15:30',
  allDay: false,
  projectId: null,
  color: null,
  amountCents: null,
  ...overrides,
});

describe('déplacer dans le calendrier : règles', () => {
  it('un élément se décale d’autant, heures et durée gardées', () => {
    expect(movedAgendaItem(item({}), 3)).toMatchObject({ start: '2026-09-28T14:00', end: '2026-09-28T15:30' });
    const bar = item({ source: 'task', kind: 'task_due', start: '2026-09-22', end: '2026-10-01', allDay: true });
    expect(movedAgendaItem(bar, -2)).toMatchObject({ start: '2026-09-20', end: '2026-09-29' });
  });

  it('un événement à heure fixe déposé sur un créneau prend cette heure', () => {
    expect(movedAgendaItem(item({}), 1, '09:15')).toMatchObject({ start: '2026-09-26T09:15', end: '2026-09-26T10:45' });
    // Une fin qui passerait le lendemain disparaît (comme en changeant l'heure dans le panneau).
    expect(movedAgendaItem(item({}), 0, '23:00')).toMatchObject({ start: '2026-09-25T23:00', end: null });
    expect(isRetimed(item({}), { day: '2026-09-26', time: '09:15' })).toBe(true);
    expect(isRetimed(item({ allDay: true }), { day: '2026-09-26', time: '09:15' })).toBe(false);
    expect(isRetimed(item({ source: 'task' }), { day: '2026-09-26', time: '09:15' })).toBe(false);
    expect(isRetimed(item({}), { day: '2026-09-26', time: null })).toBe(false);
  });

  it('arrondit l’heure au quart d’heure, dans la journée', () => {
    expect(snapTime(14 * 60 + 7)).toBe('14:00');
    expect(snapTime(14 * 60 + 8)).toBe('14:15');
    expect(snapTime(-30)).toBe('00:00');
    expect(snapTime(24 * 60 + 20)).toBe('23:45');
  });

  it('un début de projet ne passe pas après sa deadline, ni l’inverse', () => {
    const project = { startDate: '2026-09-28', deadline: '2026-10-02' };
    expect(projectMoveProblem(project, 'project_start', 4)).toBeNull();
    expect(projectMoveProblem(project, 'project_start', 5)).toBe('Le début du projet passerait après sa deadline.');
    expect(projectMoveProblem(project, 'project_deadline', -5)).toBe('La deadline du projet passerait avant son début.');
    expect(projectMoveProblem({ startDate: null, deadline: '2026-10-02' }, 'project_deadline', -30)).toBeNull();
  });
});

async function seed() {
  const { db } = createTestDb();
  await db.batch([
    sql`INSERT INTO projects (id, name, type_id, status, start_date, deadline, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', '2026-09-10', '2026-10-02', ${NOW}, ${NOW})`,
    insertTaskStatement(
      't1',
      { title: 'Maquette', projectId: 'p1', scheduledDate: '2026-09-22', dueDate: '2026-10-01', priority: 1, estimateMin: null, notes: null },
      NOW,
    ),
    insertTaskStatement(
      't2',
      { title: 'Relance', projectId: 'p1', scheduledDate: null, dueDate: '2026-09-30', priority: 1, estimateMin: null, notes: null },
      NOW,
    ),
    sql`INSERT INTO payments (id, project_id, label, amount_cents, due_date, status, created_at, updated_at)
        VALUES ('pay', 'p1', 'Solde', 100000, '2026-10-02', 'planned', ${NOW}, ${NOW})`,
    insertEventStatement(
      'e1',
      {
        title: 'Point',
        kind: 'appointment',
        timing: { date: '2026-09-25', allDay: false, endDate: null, startTime: '14:00', endTime: '15:30' },
        location: null,
        notes: null,
        projectId: null,
      },
      NOW,
    ),
    insertEventStatement(
      'e2',
      {
        title: 'Salon',
        kind: 'personal',
        timing: { date: '2026-10-01', allDay: true, endDate: '2026-10-02', startTime: null, endTime: null },
        location: null,
        notes: null,
        projectId: null,
      },
      NOW,
    ),
  ]);
  return db;
}

const agendaItem = async (db: Awaited<ReturnType<typeof seed>>, key: string) =>
  (await listAgenda(db, '2026-09-01', '2026-11-01')).find((i) => i.key === key)!;

describe('déplacer dans le calendrier : enregistrement', () => {
  it('chaque date change là où elle est stockée, et « Annuler » la remet', async () => {
    const db = await seed();
    const moves = [
      await agendaItem(db, 'task:t1:task_due'),
      await agendaItem(db, 'task:t2:task_due'),
      await agendaItem(db, 'project:p1:project_start'),
      await agendaItem(db, 'project:p1:project_deadline'),
      await agendaItem(db, 'payment:pay:payment_due'),
      await agendaItem(db, 'event:e1:appointment'),
      await agendaItem(db, 'event:e2:personal'),
    ].map((i) => buildShiftBatch(i, 3, NOW));
    await db.batch(moves.flatMap((m) => m.statements));

    expect(await getTask(db, 't1')).toMatchObject({ scheduledDate: '2026-09-25', dueDate: '2026-10-04' });
    expect(await getTask(db, 't2')).toMatchObject({ scheduledDate: null, dueDate: '2026-10-03' });
    expect(await getProjectRow(db, 'p1')).toMatchObject({ startDate: '2026-09-13', deadline: '2026-10-05' });
    expect(await getPaymentRow(db, 'pay')).toMatchObject({ dueDate: '2026-10-05' });
    expect(await getEvent(db, 'e1')).toMatchObject({ startsAt: '2026-09-28T14:00', endsAt: '2026-09-28T15:30' });
    expect(await getEvent(db, 'e2')).toMatchObject({ startsAt: '2026-10-04', endsAt: '2026-10-05' });

    await db.batch(moves.flatMap((m) => m.undo));
    expect(await getTask(db, 't1')).toMatchObject({ scheduledDate: '2026-09-22', dueDate: '2026-10-01' });
    expect(await getProjectRow(db, 'p1')).toMatchObject({ startDate: '2026-09-10', deadline: '2026-10-02' });
    expect(await getEvent(db, 'e2')).toMatchObject({ startsAt: '2026-10-01', endsAt: '2026-10-02' });
  });

  it('un encaissement reçu ne bouge pas', async () => {
    const db = await seed();
    const payment = await agendaItem(db, 'payment:pay:payment_due');
    await db.batch([sql`UPDATE payments SET status = 'received', received_date = '2026-09-25' WHERE id = 'pay'`]);
    await db.batch(buildShiftBatch(payment, 3, NOW).statements);
    expect(await getPaymentRow(db, 'pay')).toMatchObject({ dueDate: '2026-10-02' });
  });

  it('un rendez-vous déposé sur un créneau change de jour et d’heure, sa durée gardée', async () => {
    const db = await seed();
    const event = (await getEvent(db, 'e1'))!;
    const batch = buildRetimeEventBatch(event, '2026-09-29', '09:15', NOW);
    await db.batch(batch.statements);
    expect(await getEvent(db, 'e1')).toMatchObject({ startsAt: '2026-09-29T09:15', endsAt: '2026-09-29T10:45' });
    await db.batch(batch.undo);
    expect(await getEvent(db, 'e1')).toMatchObject({ startsAt: '2026-09-25T14:00', endsAt: '2026-09-25T15:30' });
  });
});
