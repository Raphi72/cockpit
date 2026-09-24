import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { listClients } from '@/domains/clients/repository';
import { buildRestoreClientBatch, deleteClient } from '@/domains/clients/service';
import { listProjectPayments } from '@/domains/finance/payments/repository';
import { buildReceivePaymentBatch } from '@/domains/finance/payments/service';
import type { NewProjectInput } from '@/domains/projects/model';
import { getProject, listProjects, updateProjectStatement } from '@/domains/projects/repository';
import { buildCreateProjectBatch, buildRestoreProjectBatch, buildSetClientBatch, deleteProject } from '@/domains/projects/service';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-24T10:00:00.000Z';
const TODAY = '2026-09-24';

function context() {
  let n = 0;
  return { now: NOW, today: TODAY, newId: () => `id-${++n}` };
}

const baseInput: NewProjectInput = {
  name: '  Site vitrine  ',
  typeId: 'type-freelance',
  client: { kind: 'new', name: 'Boulangerie Marchal' },
  status: 'active',
  priority: 1,
  startDate: '2026-09-25',
  deadline: '2026-10-10',
  budgetCents: 200000,
  schedule: 'deposit30',
  description: null,
};

describe('création d’un projet', () => {
  it('crée le client, le projet et son échéancier en une transaction', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(baseInput, context());
    await db.batch(statements);

    const project = await getProject(db, projectId);
    expect(project).toMatchObject({
      name: 'Site vitrine',
      clientName: 'Boulangerie Marchal',
      typeName: 'Freelance',
      typeColor: 'blue',
      budgetCents: 200000,
      scheduledCents: 200000,
      receivedCents: 0,
      tasksTotal: 0,
    });

    const payments = await listProjectPayments(db, projectId);
    expect(payments.map((p) => [p.label, p.amountCents, p.dueDate])).toEqual([
      ['Acompte 30 %', 60000, '2026-09-25'],
      ['Solde', 140000, '2026-10-10'],
    ]);
  });

  it('un reçu met à jour les montants calculés du projet et du client', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(baseInput, context());
    await db.batch(statements);
    const [deposit] = await listProjectPayments(db, projectId);
    await db.batch(buildReceivePaymentBatch(deposit!, { receivedDate: TODAY, accountId: null }, context()).statements);

    expect(await getProject(db, projectId)).toMatchObject({ receivedCents: 60000 });
    const [client] = await listClients(db);
    expect(client).toMatchObject({ name: 'Boulangerie Marchal', projectCount: 1, dueCents: 140000 });
  });
});

describe('modification et filtres', () => {
  it('édite sur place et range les projets selon leur statut', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(
      { ...baseInput, client: { kind: 'none' }, budgetCents: null },
      context(),
    );
    await db.batch(statements);

    await db.batch([updateProjectStatement(projectId, { status: 'done', deadline: null }, NOW)]);
    const done = await getProject(db, projectId);
    expect(done).toMatchObject({ status: 'done', deadline: null, completedAt: NOW });

    expect(await listProjects(db, { statuses: ['active'] })).toHaveLength(0);
    expect(await listProjects(db, { statuses: ['done', 'cancelled'] })).toHaveLength(1);
    expect(await listProjects(db, { statuses: ['done'], typeId: 'type-mission' })).toHaveLength(0);
  });

  it('change de client en le créant à la volée', async () => {
    const { db } = createTestDb();
    const ctx = context();
    const { projectId, statements } = buildCreateProjectBatch({ ...baseInput, client: { kind: 'none' } }, ctx);
    await db.batch(statements);
    await db.batch(buildSetClientBatch(projectId, { kind: 'new', name: 'Studio Lumen' }, ctx));

    expect(await getProject(db, projectId)).toMatchObject({ clientName: 'Studio Lumen' });
  });
});

describe('suppression', () => {
  it('supprime un projet et ses échéances non reçues', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(baseInput, context());
    await db.batch(statements);

    expect(await deleteProject(db, projectId)).toMatchObject({ status: 'deleted' });
    expect(await getProject(db, projectId)).toBeUndefined();
    expect(await db.query('SELECT id FROM payments')).toEqual([]);
  });

  it('« Annuler » remet le projet, ses tâches, ses échéances et ses rattachements', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(baseInput, context());
    await db.batch(statements);
    await db.batch([
      sql`INSERT INTO tasks (id, project_id, title, status, sort_order, completed_at, created_at, updated_at)
          VALUES ('k1', ${projectId}, 'Maquette', 'done', 1, ${NOW}, ${NOW}, ${NOW}),
                 ('k2', ${projectId}, 'Intégration', 'todo', 2, NULL, ${NOW}, ${NOW})`,
      sql`INSERT INTO events (id, title, kind, all_day, starts_at, project_id, created_at, updated_at)
          VALUES ('e1', 'Réunion de lancement', 'meeting', 0, '2026-09-28T10:00', ${projectId}, ${NOW}, ${NOW})`,
      sql`INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, project_id, created_at, updated_at)
          VALUES ('t1', 'account-business', 'expense', -1500, '2026-09-20', 'Police de caractères', ${projectId}, ${NOW}, ${NOW})`,
    ]);
    const before = await getProject(db, projectId);

    const result = await deleteProject(db, projectId);
    if (result.status !== 'deleted') throw new Error('suppression attendue');
    // L'événement et la dépense restent, détachés ; les tâches et les échéances partent.
    expect(await db.query('SELECT project_id FROM events')).toEqual([{ projectId: null }]);
    expect(await db.query('SELECT id FROM tasks')).toEqual([]);

    await db.batch(buildRestoreProjectBatch(result.snapshot, NOW));
    expect(await getProject(db, projectId)).toEqual(before);
    expect(await db.query('SELECT id, status, sort_order FROM tasks ORDER BY sort_order')).toEqual([
      { id: 'k1', status: 'done', sortOrder: 1 },
      { id: 'k2', status: 'todo', sortOrder: 2 },
    ]);
    expect(await listProjectPayments(db, projectId)).toHaveLength(2);
    expect(await db.query('SELECT project_id FROM events')).toEqual([{ projectId }]);
    expect(await db.query('SELECT project_id FROM transactions')).toEqual([{ projectId }]);
  });

  it('« Annuler » remet un client supprimé et le rattache à ses projets et encaissements', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(baseInput, context());
    await db.batch(statements);
    const clientId = (await listClients(db))[0]!.id;
    await db.batch([
      sql`INSERT INTO payments (id, client_id, label, amount_cents, status, created_at, updated_at)
          VALUES ('m9', ${clientId}, 'Logo', 30000, 'planned', ${NOW}, ${NOW})`,
    ]);
    const [client] = await listClients(db);

    const snapshot = await deleteClient(db, client!.id);
    expect(await getProject(db, projectId)).toMatchObject({ clientName: null });
    expect(await listClients(db)).toEqual([]);

    await db.batch(buildRestoreClientBatch(snapshot!, NOW));
    expect(await listClients(db)).toEqual([client]);
    expect(await getProject(db, projectId)).toMatchObject({ clientName: 'Boulangerie Marchal' });
    expect(await db.query("SELECT client_id FROM payments WHERE id = 'm9'")).toEqual([{ clientId: client!.id }]);
  });

  it('refuse de supprimer un projet qui a déjà reçu de l’argent', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(baseInput, context());
    await db.batch(statements);
    const [deposit] = await listProjectPayments(db, projectId);
    await db.batch(buildReceivePaymentBatch(deposit!, { receivedDate: TODAY, accountId: null }, context()).statements);

    expect(await deleteProject(db, projectId)).toEqual({ status: 'has-received-payments' });
    expect(await getProject(db, projectId)).toBeDefined();
  });
});
