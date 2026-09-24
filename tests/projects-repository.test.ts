import { describe, expect, it } from 'vitest';
import { listClients } from '@/domains/clients/repository';
import { listProjectPayments, setPaymentReceived } from '@/domains/finance/payments/repository';
import type { NewProjectInput } from '@/domains/projects/model';
import { getProject, listProjects, updateProjectStatement } from '@/domains/projects/repository';
import { buildCreateProjectBatch, buildSetClientBatch, deleteProject } from '@/domains/projects/service';
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
    await setPaymentReceived(db, deposit!.id, TODAY, NOW);

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

    expect(await deleteProject(db, projectId)).toBe('deleted');
    expect(await getProject(db, projectId)).toBeUndefined();
    expect(await db.query('SELECT id FROM payments')).toEqual([]);
  });

  it('refuse de supprimer un projet qui a déjà reçu de l’argent', async () => {
    const { db } = createTestDb();
    const { projectId, statements } = buildCreateProjectBatch(baseInput, context());
    await db.batch(statements);
    const [deposit] = await listProjectPayments(db, projectId);
    await setPaymentReceived(db, deposit!.id, TODAY, NOW);

    expect(await deleteProject(db, projectId)).toBe('has-received-payments');
    expect(await getProject(db, projectId)).toBeDefined();
  });
});
