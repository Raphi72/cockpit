import { describe, expect, it } from 'vitest';
import type { NewEventInput } from '@/domains/agenda/model';
import {
  deleteEventStatement,
  getEvent,
  insertEventStatement,
  listAgenda,
  restoreEventStatement,
  updateEventStatement,
} from '@/domains/agenda/repository';
import { markReceivedStatement } from '@/domains/finance/payments/repository';
import { buildCreatePaymentBatch } from '@/domains/finance/payments/service';
import { updateProjectStatement } from '@/domains/projects/repository';
import { buildCreateProjectBatch } from '@/domains/projects/service';
import type { NewTaskInput } from '@/domains/tasks/model';
import { insertTaskStatement, updateTaskStatement } from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-24T10:00:00.000Z';
const SEPTEMBER = { from: '2026-09-01', to: '2026-10-01' };

const newEvent = (overrides: Partial<NewEventInput> = {}): NewEventInput => ({
  title: 'Rendez-vous comptable',
  kind: 'appointment',
  timing: { date: '2026-09-24', allDay: false, endDate: null, startTime: '14:00', endTime: '15:00' },
  location: null,
  notes: null,
  projectId: null,
  ...overrides,
});

const newTask = (overrides: Partial<NewTaskInput> = {}): NewTaskInput => ({
  title: 'Tâche',
  projectId: null,
  scheduledDate: null,
  dueDate: null,
  priority: 1,
  estimateMin: null,
  notes: null,
  ...overrides,
});

/** Un projet en cours du 1er au 30 septembre, avec un acompte au 1er et un solde au 30. */
async function setup() {
  const { db } = createTestDb();
  let n = 0;
  const ctx = { now: NOW, today: '2026-09-24', newId: () => `id${++n}` };
  const { projectId, statements } = buildCreateProjectBatch(
    {
      name: 'Site vitrine',
      typeId: 'type-freelance',
      client: { kind: 'new', name: 'Studio Lumen' },
      status: 'active',
      priority: 1,
      startDate: '2026-09-01',
      deadline: '2026-09-30',
      budgetCents: 200000,
      schedule: 'half',
      description: null,
    },
    ctx,
  );
  await db.batch(statements);
  return { db, projectId, ctx };
}

const keysOf = async (db: Awaited<ReturnType<typeof setup>>['db'], range = SEPTEMBER) =>
  (await listAgenda(db, range.from, range.to)).map((item) => `${item.kind}:${item.title}:${item.start}`);

describe('agenda (P8)', () => {
  it('réunit toutes les sources de la plage, sans rien recopier', async () => {
    const { db, projectId } = await setup();
    await db.batch([
      insertEventStatement('ev1', newEvent({ projectId }), NOW),
      insertTaskStatement('t1', newTask({ title: 'Maquette', projectId, dueDate: '2026-09-10' }), NOW),
    ]);

    const items = await listAgenda(db, SEPTEMBER.from, SEPTEMBER.to);
    expect(items.map((i) => `${i.kind}:${i.title}:${i.start}`)).toEqual([
      'payment_due:Site vitrine:2026-09-01',
      'project_start:Site vitrine:2026-09-01',
      'task_due:Maquette:2026-09-10',
      'appointment:Rendez-vous comptable:2026-09-24T14:00',
      'project_deadline:Site vitrine:2026-09-30',
      'payment_due:Site vitrine:2026-09-30',
    ]);

    const event = items.find((i) => i.source === 'event')!;
    expect(event).toMatchObject({
      key: 'event:ev1:appointment',
      end: '2026-09-24T15:00',
      allDay: false,
      projectId,
      color: 'blue',
    });
    const payment = items.find((i) => i.kind === 'payment_due')!;
    expect(payment).toMatchObject({ detail: 'Premier versement', amountCents: 100000, allDay: true });
    expect(items.find((i) => i.kind === 'task_due')).toMatchObject({ detail: 'Site vitrine', color: 'blue' });

    // Chaque élément n'apparaît qu'une fois.
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('respecte les bornes de la plage : début inclus, fin exclue', async () => {
    const { db } = await setup();
    expect(await keysOf(db, { from: '2026-09-02', to: '2026-09-30' })).toEqual([]);
    expect(await keysOf(db, { from: '2026-09-30', to: '2026-10-01' })).toEqual([
      'project_deadline:Site vitrine:2026-09-30',
      'payment_due:Site vitrine:2026-09-30',
    ]);
  });

  it('montre un événement sur plusieurs jours dès qu’il chevauche la plage', async () => {
    const { db } = await setup();
    await db.batch([
      insertEventStatement(
        'salon',
        newEvent({
          title: 'Salon',
          kind: 'personal',
          timing: { date: '2026-08-30', allDay: true, endDate: '2026-09-02', startTime: null, endTime: null },
        }),
        NOW,
      ),
      insertEventStatement('soir', newEvent({ title: 'Soirée', timing: { ...newEvent().timing, date: '2026-10-01' } }), NOW),
    ]);
    expect(await keysOf(db, { from: '2026-09-02', to: '2026-09-30' })).toEqual(['personal:Salon:2026-08-30']);
    expect(await keysOf(db, { from: '2026-09-03', to: '2026-09-30' })).toEqual([]);
    // L'événement à heure fixe du 1er octobre n'entre pas dans une plage qui s'arrête avant.
    expect(await keysOf(db, { from: '2026-10-01', to: '2026-10-02' })).toEqual([
      'appointment:Soirée:2026-10-01T14:00',
    ]);
  });

  it('exclut les tâches terminées, les encaissements reçus et les projets clos', async () => {
    const { db, projectId, ctx } = await setup();
    const libre = buildCreatePaymentBatch(
      {
        label: 'Facture 12',
        amountCents: 30000,
        dueDate: '2026-09-15',
        status: 'pending',
        projectId: null,
        client: { kind: 'new', name: 'BDE' },
        invoiceRef: '12',
        notes: null,
      },
      ctx,
    );
    await db.batch([
      insertTaskStatement('faite', newTask({ title: 'Faite', dueDate: '2026-09-12' }), NOW),
      updateTaskStatement('faite', { status: 'done' }, NOW),
      insertTaskStatement('ordinaire', newTask({ title: 'Ordinaire', scheduledDate: '2026-09-12' }), NOW),
      insertTaskStatement('prioritaire', newTask({ title: 'Prioritaire', scheduledDate: '2026-09-12', priority: 2 }), NOW),
      // Début et deadline : une seule fois, du début à la deadline (une barre dans le calendrier).
      insertTaskStatement('double', newTask({ title: 'Double', scheduledDate: '2026-09-11', dueDate: '2026-09-14', priority: 3 }), NOW),
      ...libre.statements,
    ]);

    expect(await keysOf(db, { from: '2026-09-10', to: '2026-09-20' })).toEqual([
      'task_due:Double:2026-09-11',
      'task_scheduled:Prioritaire:2026-09-12',
      'payment_due:BDE:2026-09-15',
    ]);
    const double = (await listAgenda(db, '2026-09-13', '2026-09-14')).find((i) => i.id === 'double');
    // Visible sur toute sa période, même quand la plage n'en montre que le milieu.
    expect(double).toMatchObject({ start: '2026-09-11', end: '2026-09-14', allDay: true });
    // Option du calendrier : les tâches ordinaires, à leur début (jamais les terminées).
    const withPlain = await listAgenda(db, '2026-09-10', '2026-09-20', { plainTasks: true });
    expect(withPlain.filter((i) => i.source === 'task').map((i) => `${i.kind}:${i.title}`)).toEqual([
      'task_due:Double',
      'task_scheduled:Ordinaire',
      'task_scheduled:Prioritaire',
    ]);

    await db.batch([markReceivedStatement(libre.paymentId, '2026-09-15', NOW)]);
    expect(await keysOf(db, { from: '2026-09-15', to: '2026-09-16' })).toEqual([]);

    // Un projet terminé sort de l'agenda (ses encaissements non reçus restent attendus).
    await db.batch([
      insertTaskStatement('projet', newTask({ title: 'Tâche du projet', projectId, dueDate: '2026-09-20' }), NOW),
      updateProjectStatement(projectId, { status: 'done' }, NOW),
    ]);
    expect(await keysOf(db)).toEqual([
      'payment_due:Site vitrine:2026-09-01',
      'task_due:Double:2026-09-11',
      'task_scheduled:Prioritaire:2026-09-12',
      'payment_due:Site vitrine:2026-09-30',
    ]);
  });

  it('laisse de côté les Propositions : ni leurs dates, ni leurs encaissements, mais leurs tâches', async () => {
    const { db, projectId } = await setup();
    await db.batch([
      updateProjectStatement(projectId, { status: 'proposal' }, NOW),
      insertTaskStatement('t1', newTask({ title: 'Préparer le devis', projectId, dueDate: '2026-09-10' }), NOW),
    ]);
    expect(await keysOf(db)).toEqual(['task_due:Préparer le devis:2026-09-10']);

    // Signée : tout revient.
    await db.batch([updateProjectStatement(projectId, { status: 'planned' }, NOW)]);
    expect(await keysOf(db)).toContain('project_deadline:Site vitrine:2026-09-30');
    expect(await keysOf(db)).toContain('payment_due:Site vitrine:2026-09-01');
  });

  it('suit une deadline décalée, partout', async () => {
    const { db, projectId } = await setup();
    await db.batch([updateProjectStatement(projectId, { deadline: '2026-10-05' }, NOW)]);
    expect(await keysOf(db)).not.toContain('project_deadline:Site vitrine:2026-09-30');
    expect(await keysOf(db, { from: '2026-10-01', to: '2026-11-01' })).toEqual([
      'project_deadline:Site vitrine:2026-10-05',
    ]);
  });
});

describe('événements', () => {
  it('crée, modifie, supprime et restaure à l’identique', async () => {
    const { db, projectId } = await setup();
    await db.batch([insertEventStatement('ev1', newEvent({ location: ' Cabinet ', notes: '' }), NOW)]);
    expect(await getEvent(db, 'ev1')).toMatchObject({
      title: 'Rendez-vous comptable',
      allDay: false,
      startsAt: '2026-09-24T14:00',
      endsAt: '2026-09-24T15:00',
      location: 'Cabinet',
      notes: null,
      projectName: null,
    });

    await db.batch([
      updateEventStatement('ev1', { allDay: true, startsAt: '2026-09-25', endsAt: null, projectId }, NOW),
    ]);
    const updated = (await getEvent(db, 'ev1'))!;
    expect(updated).toMatchObject({ allDay: true, startsAt: '2026-09-25', endsAt: null, projectName: 'Site vitrine' });

    await db.batch([deleteEventStatement('ev1')]);
    expect(await getEvent(db, 'ev1')).toBeUndefined();
    await db.batch([restoreEventStatement(updated, NOW)]);
    expect(await getEvent(db, 'ev1')).toEqual(updated);
  });
});
