import { describe, expect, it } from 'vitest';
import {
  EXPORT_TABLES,
  csvAmount,
  csvDate,
  csvField,
  exportFileName,
  toCsv,
  type DataExport,
} from '@/domains/data/export/model';
import { buildExport } from '@/domains/data/export/service';
import { buildCreatePaymentBatch, buildReceivePaymentBatch } from '@/domains/finance/payments/service';
import { listProjectPayments } from '@/domains/finance/payments/repository';
import type { TransactionInput } from '@/domains/finance/transactions/model';
import { buildCreateTransactionBatch } from '@/domains/finance/transactions/service';
import { buildCreateProjectBatch } from '@/domains/projects/service';
import { setSettingStatement } from '@/domains/settings/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-26T10:00:00.000Z';
const TODAY = '2026-09-26';

function context() {
  let n = 0;
  return { now: NOW, today: TODAY, newId: () => `id-${++n}` };
}

const transaction = (overrides: Partial<TransactionInput>): TransactionInput => ({
  kind: 'expense',
  amountCents: 3500,
  accountId: 'account-business',
  toAccountId: null,
  date: TODAY,
  label: 'Abonnement Figma',
  categoryId: 'cat-software',
  projectId: null,
  notes: null,
  ...overrides,
});

/** Un projet en cours avec son échéancier (acompte reçu), une proposition, et quelques transactions. */
async function setup() {
  const { db } = createTestDb();
  const ctx = context();
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
  const devis = buildCreateProjectBatch(
    {
      name: 'Refonte',
      typeId: 'type-freelance',
      client: { kind: 'none' },
      status: 'proposal',
      priority: 1,
      startDate: null,
      deadline: null,
      budgetCents: null,
      schedule: 'later',
      description: null,
    },
    ctx,
  );
  await db.batch(devis.statements);
  await db.batch(
    buildCreatePaymentBatch(
      {
        label: 'Devis ; « urgent »',
        amountCents: 90000,
        dueDate: '2026-11-02',
        status: 'planned',
        projectId: devis.projectId,
        client: { kind: 'none' },
        invoiceRef: null,
        notes: null,
      },
      ctx,
    ).statements,
  );
  const [deposit] = await listProjectPayments(db, site.projectId);
  await db.batch(
    buildReceivePaymentBatch(deposit!, { receivedDate: '2026-09-05', accountId: 'account-business' }, ctx).statements,
  );
  await db.batch(buildCreateTransactionBatch(transaction({ date: '2026-09-10', notes: 'Ligne 1\nLigne 2' }), ctx));
  await db.batch(
    buildCreateTransactionBatch(
      transaction({ kind: 'transfer', amountCents: 50000, toAccountId: 'account-personal', label: '', categoryId: null }),
      ctx,
    ),
  );
  await db.batch([setSettingStatement('dashboard.showAmounts', false)]);
  return db;
}

/** Lignes d'un CSV, sans le BOM ni la ligne vide finale. */
const lines = (csv: string) => csv.slice(1).split('\r\n').slice(0, -1);

describe('format CSV pour Excel', () => {
  it('protège les valeurs qui contiennent un séparateur, un guillemet ou un retour à la ligne', () => {
    expect(csvField('Acompte')).toBe('Acompte');
    expect(csvField('Devis ; urgent')).toBe('"Devis ; urgent"');
    expect(csvField('Le « bon » "devis"')).toBe('"Le « bon » ""devis"""');
    expect(csvField('Ligne 1\nLigne 2')).toBe('"Ligne 1\nLigne 2"');
  });

  it('écrit des montants et des dates qu’Excel lit comme des nombres et des dates', () => {
    expect(csvAmount(123456)).toBe('1234,56');
    expect(csvAmount(-3500)).toBe('-35,00');
    expect(csvAmount(5)).toBe('0,05');
    expect(csvAmount(-5)).toBe('-0,05');
    expect(csvDate('2026-09-05')).toBe('05/09/2026');
    expect(csvDate(null)).toBe('');
  });

  it('commence par un BOM UTF-8 et termine chaque ligne par CRLF', () => {
    const csv = toCsv(['A', 'B'], [['1', '2']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('A;B\r\n1;2\r\n');
  });

  it('nomme chaque fichier cockpit-export-…, le motif ignoré par Git', () => {
    expect(exportFileName('data', TODAY)).toBe('cockpit-export-donnees-2026-09-26.json');
    expect(exportFileName('transactions', TODAY)).toBe('cockpit-export-transactions-2026-09-26.csv');
    expect(exportFileName('payments', TODAY)).toBe('cockpit-export-encaissements-2026-09-26.csv');
  });
});

describe('exports', () => {
  it('JSON : toutes les tables de données, sans les réglages ni le journal technique', async () => {
    const db = await setup();
    const data = JSON.parse(await buildExport(db, 'data', NOW)) as DataExport;

    expect(data).toMatchObject({ application: 'Cockpit', format: 1, schemaVersion: 4, exportedAt: NOW });
    expect(Object.keys(data.tables)).toEqual(EXPORT_TABLES.map((t) => t.key));
    expect(data.tables.projects.map((p) => p.name)).toEqual(['Site vitrine', 'Refonte']);
    expect(data.tables.payments).toHaveLength(3);
    expect(data.tables.transactions).toHaveLength(4); // revenu, dépense, virement (2 lignes)
    expect(data.tables.accounts).toHaveLength(2);
    expect(data.tables.clients[0]).toMatchObject({ name: 'Boulangerie Marchal', archivedAt: null });
    expect(data.tables.projects[0]).toMatchObject({ budgetCents: 200000, clientId: data.tables.clients[0]!.id });
    expect(JSON.stringify(data)).not.toContain('dashboard.showAmounts');
  });

  it('CSV des transactions : une ligne par mouvement, montant signé, la plus ancienne d’abord', async () => {
    const db = await setup();
    const rows = lines(await buildExport(db, 'transactions', NOW));
    expect(rows[0]).toBe('Date;Compte;Type;Libellé;Catégorie;Projet;Montant (€);Notes');
    expect(rows.slice(1)).toEqual([
      '05/09/2026;Compte professionnel;Revenu;Acompte 30 %;Revenus client;Site vitrine;600,00;',
      '10/09/2026;Compte professionnel;Dépense;Abonnement Figma;Logiciels & abonnements;;-35,00;"Ligne 1\nLigne 2"',
      '26/09/2026;Compte professionnel;Virement;Virement;;;-500,00;',
      '26/09/2026;Compte personnel;Virement;Virement;;;500,00;',
    ]);
  });

  it('CSV des encaissements : client du projet, statut, et les propositions signalées', async () => {
    const db = await setup();
    const rows = lines(await buildExport(db, 'payments', NOW));
    expect(rows[0]).toBe('Libellé;Projet;Client;Montant (€);Date prévue;Statut;Reçu le;N° de facture;Notes');
    expect(rows.slice(1)).toEqual([
      'Acompte 30 %;Site vitrine;Boulangerie Marchal;600,00;01/09/2026;Reçu;05/09/2026;;',
      'Solde;Site vitrine;Boulangerie Marchal;1400,00;10/10/2026;Prévu;;;',
      '"Devis ; « urgent »";Refonte;;900,00;02/11/2026;Prévu (proposition);;;',
    ]);
  });
});
