import { describe, expect, it } from 'vitest';
import { splitArchived } from '@/domains/clients/model';
import { listClients, setClientArchivedStatement } from '@/domains/clients/repository';
import { listProjectPayments } from '@/domains/finance/payments/repository';
import { buildCreatePaymentBatch, buildReceivePaymentBatch } from '@/domains/finance/payments/service';
import { buildCreateProjectBatch } from '@/domains/projects/service';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-26T10:00:00.000Z';
const TODAY = '2026-09-26';

async function setup() {
  const { db } = createTestDb();
  let n = 0;
  const ctx = { now: NOW, today: TODAY, newId: () => `id-${++n}` };
  // Un projet en cours (acompte reçu, solde attendu) et une proposition, pour le même client.
  const site = buildCreateProjectBatch(
    {
      name: 'Site vitrine',
      typeId: 'type-freelance',
      client: { kind: 'new', name: 'Boulangerie Marchal' },
      status: 'active',
      priority: 1,
      startDate: '2026-09-01',
      deadline: '2026-10-10',
      budgetCents: 200000,
      schedule: 'deposit30',
      description: null,
    },
    ctx,
  );
  await db.batch(site.statements);
  const [client] = await listClients(db);
  const devis = buildCreateProjectBatch(
    {
      name: 'Refonte',
      typeId: 'type-freelance',
      client: { kind: 'existing', id: client!.id, name: client!.name },
      status: 'proposal',
      priority: 1,
      startDate: null,
      deadline: null,
      budgetCents: 90000,
      schedule: 'single',
      description: null,
    },
    ctx,
  );
  await db.batch(devis.statements);
  const [deposit] = await listProjectPayments(db, site.projectId);
  await db.batch(buildReceivePaymentBatch(deposit!, { receivedDate: TODAY, accountId: null }, ctx).statements);
  // Un encaissement sans projet, directement rattaché au client.
  await db.batch(
    buildCreatePaymentBatch(
      {
        label: 'Retouches',
        amountCents: 15000,
        dueDate: '2026-10-01',
        status: 'planned',
        projectId: null,
        client: { kind: 'existing', id: client!.id, name: client!.name },
        invoiceRef: null,
        notes: null,
      },
      ctx,
    ).statements,
  );
  return { db, clientId: client!.id };
}

describe('clients', () => {
  it('fiche : ce qui est encaissé et ce qui reste à recevoir (propositions exclues)', async () => {
    const { db } = await setup();
    const [client] = await listClients(db);
    expect(client).toMatchObject({
      name: 'Boulangerie Marchal',
      projectCount: 2,
      receivedCents: 60000, // l'acompte
      dueCents: 155000, // le solde (1 400 €) et les retouches (150 €), pas le devis de la proposition
      archivedAt: null,
    });
  });

  it('archiver : le client reste lisible, à part des clients actifs ; réactiver le remet', async () => {
    const { db, clientId } = await setup();
    await db.batch([setClientArchivedStatement(clientId, NOW, NOW)]);
    const clients = await listClients(db);
    expect(splitArchived(clients).active).toEqual([]);
    expect(splitArchived(clients).archived).toMatchObject([{ id: clientId, archivedAt: NOW, receivedCents: 60000 }]);

    await db.batch([setClientArchivedStatement(clientId, null, NOW)]);
    expect(splitArchived(await listClients(db)).active).toHaveLength(1);
  });
});
