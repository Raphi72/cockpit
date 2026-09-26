import { describe, expect, it, vi } from 'vitest';
import { insertEventStatement } from '@/domains/agenda/repository';
import { buildCreatePaymentBatch } from '@/domains/finance/payments/service';
import {
  bundleNotices,
  deadlineNotices,
  eventNotices,
  momentOf,
  nextRoundDay,
  paymentNotices,
  priorityTaskNotices,
  projectStartNotices,
  resolveRules,
  roundFor,
  summaryNotice,
  type Moment,
  type Notice,
} from '@/domains/notifications/model';
import { claimNotification } from '@/domains/notifications/repository';
import { collectNotices, runNotifications } from '@/domains/notifications/service';
import { buildCreateProjectBatch } from '@/domains/projects/service';
import { setSettingStatement } from '@/domains/settings/repository';
import type { NewTaskInput } from '@/domains/tasks/model';
import { insertTaskStatement } from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const TODAY = '2026-09-27';
const at = (time: string, today = TODAY): Moment => ({ today, time });

describe('règles et moments', () => {
  it('active toute règle absente du réglage', () => {
    expect(resolveRules(null)).toEqual({
      events: true,
      deadlines: true,
      priorityTasks: true,
      payments: true,
      projectStarts: true,
      morningSummary: true,
    });
    expect(resolveRules({ payments: false }).payments).toBe(false);
    expect(resolveRules({ payments: false }).events).toBe(true);
  });

  it('lit l’heure locale', () => {
    expect(momentOf(new Date(2026, 8, 27, 7, 5))).toEqual({ today: TODAY, time: '07:05' });
  });

  it('fait une tournée à l’ouverture, puis chaque matin à 8 h', () => {
    // Ouverture à 7 h : tournée tout de suite, puis celle de 8 h.
    expect(roundFor(at('07:00'), null, true)).toBe('launch');
    expect(nextRoundDay(at('07:00'), null, 'launch')).toBeNull();
    expect(roundFor(at('07:59'), null, false)).toBeNull();
    expect(roundFor(at('08:00'), null, false)).toBe('morning');
    expect(nextRoundDay(at('08:00'), null, 'morning')).toBe(TODAY);
    expect(roundFor(at('15:00'), TODAY, false)).toBeNull();

    // Ouverture à 9 h : elle vaut la tournée du matin.
    expect(nextRoundDay(at('09:00'), null, 'launch')).toBe(TODAY);
    expect(roundFor(at('09:01'), TODAY, false)).toBeNull();

    // Resté ouvert la nuit : rien à minuit, la tournée attend 8 h.
    expect(roundFor(at('00:01', '2026-09-28'), TODAY, false)).toBeNull();
    expect(roundFor(at('08:00', '2026-09-28'), TODAY, false)).toBe('morning');
  });
});

describe('textes des notifications', () => {
  it('annonce un rendez-vous 15 minutes avant, ou ce qu’il en reste', () => {
    const events = [
      { id: 'e1', title: 'Rendez-vous comptable', startsAt: `${TODAY}T14:00`, location: 'Cabinet Morel' },
      { id: 'e2', title: 'Appel client', startsAt: `${TODAY}T13:46`, location: null },
      { id: 'e3', title: 'Point', startsAt: `${TODAY}T13:45`, location: null },
      { id: 'e4', title: 'Nuit blanche', startsAt: '2026-09-28T00:05', location: null },
    ];
    expect(eventNotices(events.slice(0, 3), at('13:45'))).toEqual([
      { key: `event:e1:${TODAY}T14:00`, title: 'Rendez-vous comptable', body: 'Dans 15 minutes, à 14:00 · Cabinet Morel' },
      { key: `event:e2:${TODAY}T13:46`, title: 'Appel client', body: 'Dans 1 minute, à 13:46' },
      { key: `event:e3:${TODAY}T13:45`, title: 'Point', body: 'Maintenant, à 13:45' },
    ]);
    expect(eventNotices(events.slice(3), at('23:55'))[0]?.body).toBe('Dans 10 minutes, à 00:05');
  });

  it('prévient d’une deadline dans les 3 jours, puis le jour même', () => {
    const deadline = (date: string) => [{ source: 'project' as const, id: 'p1', title: 'Site vitrine', date }];
    expect(deadlineNotices(deadline('2026-09-30'), TODAY)).toEqual([
      { key: 'project-deadline:p1:2026-09-30:J-3', title: 'Site vitrine', body: 'Deadline dans 3 jours · mercredi 30 septembre' },
    ]);
    // Cockpit fermé à J-3 : le rappel part à J-1, sous la même clé.
    expect(deadlineNotices(deadline('2026-09-28'), TODAY)[0]).toMatchObject({
      key: 'project-deadline:p1:2026-09-28:J-3',
      body: 'Deadline demain',
    });
    expect(deadlineNotices(deadline(TODAY), TODAY)[0]).toMatchObject({
      key: `project-deadline:p1:${TODAY}:J`,
      body: 'Deadline aujourd’hui',
    });
    expect(deadlineNotices(deadline('2026-10-01'), TODAY)).toEqual([]);
    expect(deadlineNotices(deadline('2026-09-26'), TODAY)).toEqual([]);

    const echeance = [{ source: 'event' as const, id: 'e1', title: 'Dossier de bourse', date: '2026-09-29' }];
    expect(deadlineNotices(echeance, TODAY)[0]).toMatchObject({
      key: 'event-deadline:e1:2026-09-29:J-3',
      body: 'Échéance dans 2 jours · mardi 29 septembre',
    });
  });

  it('rappelle une tâche Haute ou Urgente la veille de sa deadline', () => {
    const task = { id: 't1', title: 'Envoyer la maquette', dueDate: '2026-09-28', projectName: 'Site vitrine' };
    expect(priorityTaskNotices([{ ...task, priority: 3 }], TODAY)).toEqual([
      { key: 'task-due:t1:2026-09-28', title: 'Envoyer la maquette', body: 'Tâche urgente, deadline demain · Site vitrine' },
    ]);
    expect(priorityTaskNotices([{ ...task, priority: 2, projectName: null }], TODAY)[0]?.body).toBe(
      'Tâche prioritaire, deadline demain',
    );
    expect(priorityTaskNotices([{ ...task, priority: 1 }], TODAY)).toEqual([]);
    expect(priorityTaskNotices([{ ...task, priority: 3, dueDate: TODAY }], TODAY)).toEqual([]);
  });

  it('prévient d’un encaissement la veille, puis s’il passe en retard, montants selon le réglage', () => {
    const payments = [
      { id: 'a', label: 'Acompte', name: 'Site vitrine', dueDate: '2026-09-28', amountCents: 60000 },
      { id: 'b', label: 'Facture 12', name: null, dueDate: '2026-09-24', amountCents: 45050 },
      { id: 'c', label: 'Solde', name: 'Site vitrine', dueDate: TODAY, amountCents: 140000 },
    ];
    const plain = (notices: Notice[]) => notices.map((n) => ({ ...n, body: n.body.replace(/[  ]/g, ' ') }));
    expect(plain(paymentNotices(payments, TODAY, true))).toEqual([
      { key: 'payment-due:a:2026-09-28', title: 'Site vitrine', body: 'Prévu demain : Acompte · 600 €' },
      { key: 'payment-late:b:2026-09-24', title: 'Encaissement', body: 'En retard de 3 jours : Facture 12 · 450,50 €' },
    ]);
    expect(paymentNotices(payments, TODAY, false).map((n) => n.body)).toEqual([
      'Prévu demain : Acompte',
      'En retard de 3 jours : Facture 12',
    ]);
  });

  it('annonce le début d’un projet, qui passe En cours s’il était À venir', () => {
    expect(
      projectStartNotices(
        [
          { id: 'p1', name: 'Refonte', startDate: TODAY, savedStatus: 'planned' },
          { id: 'p2', name: 'Mission', startDate: TODAY, savedStatus: 'active' },
        ],
        TODAY,
      ).map((n) => `${n.key} ${n.body}`),
    ).toEqual([
      `project-start:p1:${TODAY} Commence aujourd’hui : il passe En cours`,
      `project-start:p2:${TODAY} Commence aujourd’hui`,
    ]);
  });

  it('résume la journée comme le dashboard, et se tait s’il n’y a rien', () => {
    expect(summaryNotice({ todayCount: 3, overdueCount: 1, nextEvent: null }, TODAY)).toEqual({
      key: `morning-summary:${TODAY}`,
      title: 'Dimanche 27 septembre',
      body: '3 tâches aujourd’hui, dont 1 en retard',
    });
    expect(summaryNotice({ todayCount: 0, overdueCount: 0, nextEvent: null }, TODAY)).toBeNull();
  });

  it('regroupe au-delà de 3 notifications à la fois', () => {
    const notice = (title: string): Notice => ({ key: title, title, body: `corps ${title}` });
    expect(bundleNotices(['A', 'B', 'C'].map(notice))).toHaveLength(3);
    expect(bundleNotices(['A', 'B', 'C', 'D', 'E'].map(notice))).toEqual([
      { title: 'A', body: 'corps A' },
      { title: 'B', body: 'corps B' },
      { title: '3 autres rappels', body: 'C · D · E' },
    ]);
  });
});

// ─── Sur une vraie base ─────────────────────────────────────────────────────

const NOW = '2026-09-27T11:50:00.000Z';

const newTask = (overrides: Partial<NewTaskInput>): NewTaskInput => ({
  title: 'Tâche',
  projectId: null,
  scheduledDate: null,
  dueDate: null,
  priority: 1,
  estimateMin: null,
  notes: null,
  ...overrides,
});

/**
 * Le 27 septembre : « Site vitrine » (deadline le 30, premier versement en retard depuis le 1er),
 * « Refonte » qui commence aujourd'hui, un devis (Proposition) à rendre demain, une tâche urgente
 * pour demain, un encaissement sans projet prévu demain et un rendez-vous à 14 h.
 */
async function setup() {
  const { db } = createTestDb();
  let n = 0;
  const ctx = { now: NOW, today: TODAY, newId: () => `id${++n}` };
  const project = (name: string, status: 'active' | 'planned' | 'proposal', dates: { start: string | null; deadline: string | null }, budgetCents: number | null) =>
    buildCreateProjectBatch(
      {
        name,
        typeId: 'type-freelance',
        client: { kind: 'none' },
        status,
        priority: 1,
        startDate: dates.start,
        deadline: dates.deadline,
        budgetCents,
        schedule: budgetCents ? 'half' : 'later',
        description: null,
      },
      ctx,
    );
  const site = project('Site vitrine', 'active', { start: '2026-09-01', deadline: '2026-09-30' }, 200000);
  const refonte = project('Refonte', 'planned', { start: TODAY, deadline: null }, null);
  const devis = project('Devis boutique', 'proposal', { start: null, deadline: '2026-09-28' }, 90000);
  const facture = buildCreatePaymentBatch(
    {
      label: 'Facture 12',
      amountCents: 45000,
      dueDate: '2026-09-28',
      status: 'planned',
      projectId: null,
      client: { kind: 'new', name: 'Studio Nova' },
      invoiceRef: null,
      notes: null,
    },
    ctx,
  );
  await db.batch([
    ...site.statements,
    ...refonte.statements,
    ...devis.statements,
    ...facture.statements,
    insertTaskStatement('t1', newTask({ title: 'Envoyer la maquette', projectId: site.projectId, dueDate: '2026-09-28', priority: 3 }), NOW),
    insertTaskStatement('t2', newTask({ title: 'Relire le devis', dueDate: '2026-09-28' }), NOW),
    insertTaskStatement('t3', newTask({ title: 'Appeler la banque', scheduledDate: TODAY }), NOW),
    insertEventStatement(
      'ev1',
      {
        title: 'Rendez-vous comptable',
        kind: 'appointment',
        timing: { date: TODAY, allDay: false, endDate: null, startTime: '14:00', endTime: null },
        location: null,
        notes: null,
        projectId: null,
      },
      NOW,
    ),
  ]);
  const first = await db.queryOne<{ id: string }>("SELECT id FROM payments WHERE label = 'Premier versement'");
  const ids = { site: site.projectId, refonte: refonte.projectId, firstPayment: first!.id, facture: facture.paymentId };
  return { db, ids };
}

const keysAt = async (db: Awaited<ReturnType<typeof setup>>['db'], moment: Moment, round: 'launch' | 'morning' | null) =>
  (await collectNotices(db, moment, round)).map((notice) => notice.key);

describe('vérification des notifications', () => {
  it('réunit, à l’ouverture, tout ce qui est dû (sans les Propositions)', async () => {
    const { db, ids } = await setup();
    expect(await keysAt(db, at('13:50'), 'launch')).toEqual([
      `event:ev1:${TODAY}T14:00`,
      `project-deadline:${ids.site}:2026-09-30:J-3`,
      'task-due:t1:2026-09-28',
      `payment-late:${ids.firstPayment}:2026-09-01`,
      `payment-due:${ids.facture}:2026-09-28`,
      `project-start:${ids.refonte}:${TODAY}`,
    ]);
  });

  it('entre deux tournées, ne regarde que les rendez-vous', async () => {
    const { db } = await setup();
    expect(await keysAt(db, at('13:40'), null)).toEqual([]);
    expect(await keysAt(db, at('13:45'), null)).toEqual([`event:ev1:${TODAY}T14:00`]);
    expect(await keysAt(db, at('14:01'), null)).toEqual([]);
  });

  it('n’envoie le résumé qu’à la tournée du matin, avant midi', async () => {
    const { db } = await setup();
    const morning = await collectNotices(db, at('08:00'), 'morning');
    expect(morning[0]).toEqual({
      key: `morning-summary:${TODAY}`,
      title: 'Dimanche 27 septembre',
      body: '1 tâche aujourd’hui · rendez-vous à 14:00',
    });
    expect(await keysAt(db, at('08:00'), 'launch')).not.toContain(`morning-summary:${TODAY}`);
    expect(await keysAt(db, at('12:30'), 'morning')).not.toContain(`morning-summary:${TODAY}`);
  });

  it('respecte les règles désactivées et le réglage des montants', async () => {
    const { db } = await setup();
    await db.batch([
      setSettingStatement('notifications.rules', { events: false, deadlines: false, projectStarts: false }),
      setSettingStatement('dashboard.showAmounts', false),
    ]);
    const notices = await collectNotices(db, at('13:50'), 'launch');
    expect(notices.map((n) => `${n.title} | ${n.body}`)).toEqual([
      'Envoyer la maquette | Tâche urgente, deadline demain · Site vitrine',
      'Site vitrine | En retard de 26 jours : Premier versement',
      'Studio Nova | Prévu demain : Facture 12',
    ]);
  });

  it('n’envoie jamais deux fois la même notification, et regroupe au-delà de 3', async () => {
    const { db, ids } = await setup();
    const send = vi.fn(async (_notification: { title: string; body: string }) => undefined);
    const input = { moment: at('13:50'), round: 'launch' as const, now: NOW };

    expect(await runNotifications(db, input, send)).toBe(6);
    expect(send.mock.calls.map(([notification]) => notification.title)).toEqual([
      'Rendez-vous comptable',
      'Site vitrine',
      '4 autres rappels',
    ]);

    send.mockClear();
    expect(await runNotifications(db, input, send)).toBe(0);
    expect(await runNotifications(db, { ...input, round: 'morning' }, send)).toBe(0);
    expect(send).not.toHaveBeenCalled();

    // Une deadline décalée relance son rappel.
    await db.execute("UPDATE projects SET deadline = '2026-09-29' WHERE id = ?", [ids.site]);
    expect(await runNotifications(db, input, send)).toBe(1);
    expect(send).toHaveBeenCalledWith({ title: 'Site vitrine', body: 'Deadline dans 2 jours · mardi 29 septembre' });
  });

  it('réserve chaque notification une seule fois, et oublie le journal après six mois', async () => {
    const { db } = await setup();
    expect(await claimNotification(db, 'cle', '2026-01-01T00:00:00.000Z')).toBe(true);
    expect(await claimNotification(db, 'cle', NOW)).toBe(false);

    await runNotifications(db, { moment: at('13:50'), round: 'launch', now: NOW }, async () => undefined);
    const keys = await db.query<{ key: string }>('SELECT key FROM notification_log');
    expect(keys.map((row) => row.key)).not.toContain('cle');
    expect(keys).toHaveLength(6);
  });
});
