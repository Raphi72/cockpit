import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { adjustBalanceStatement, listAccounts } from '@/domains/finance/accounts/repository';
import type { PaymentInput } from '@/domains/finance/payments/model';
import { getPayment, listOpenPayments, listProjectPayments } from '@/domains/finance/payments/repository';
import {
  buildCreatePaymentBatch,
  buildDeletePaymentBatch,
  buildReceivePaymentBatch,
  buildRestorePaymentBatch,
  buildRestoreReceptionBatch,
  buildUnreceivePaymentBatch,
  buildUpdatePaymentBatch,
  snapshotPayment,
} from '@/domains/finance/payments/service';
import { getFinanceSummary } from '@/domains/finance/repository';
import type { TransactionInput } from '@/domains/finance/transactions/model';
import {
  deleteTransactionStatement,
  getTransaction,
  listProjectExpenses,
  listTransactions,
} from '@/domains/finance/transactions/repository';
import {
  buildCreateTransactionBatch,
  buildUpdateTransactionBatch,
  deletionTarget,
} from '@/domains/finance/transactions/service';
import { buildCreateProjectBatch } from '@/domains/projects/service';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-24T10:00:00.000Z';
const TODAY = '2026-09-24';
const PRO = 'account-business';
const PERSO = 'account-personal';

function context() {
  let n = 0;
  return { now: NOW, today: TODAY, newId: () => `id-${++n}` };
}

async function balances(db: ReturnType<typeof createTestDb>['db']) {
  const accounts = await listAccounts(db);
  return Object.fromEntries(accounts.map((a) => [a.id, a.balanceCents]));
}

const expense = (amountCents: number, accountId = PRO, date = TODAY): TransactionInput => ({
  kind: 'expense',
  amountCents,
  accountId,
  toAccountId: null,
  date,
  label: 'Abonnement Figma',
  categoryId: 'cat-software',
  projectId: null,
  notes: null,
});

const transfer = (amountCents: number, date = TODAY): TransactionInput => ({
  kind: 'transfer',
  amountCents,
  accountId: PRO,
  toAccountId: PERSO,
  date,
  label: '',
  categoryId: null,
  projectId: null,
  notes: null,
});

/** Projet « Site vitrine » (2 000 €, acompte 30 % puis solde) ; renvoie ses deux échéances. */
async function projectWithSchedule(db: ReturnType<typeof createTestDb>['db']) {
  const { projectId, statements } = buildCreateProjectBatch(
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
    { now: NOW, today: TODAY, newId: () => crypto.randomUUID() },
  );
  await db.batch(statements);
  const [deposit, balance] = await listProjectPayments(db, projectId);
  return { projectId, deposit: deposit!, balance: balance! };
}

describe('soldes et ajustements (P5)', () => {
  it('corriger un solde crée un ajustement égal à la différence', async () => {
    const { db } = createTestDb();
    const ctx = context();
    await db.batch(buildCreateTransactionBatch(expense(3500), ctx));

    await db.batch([
      adjustBalanceStatement({ id: 'adj-1', accountId: PRO, targetCents: 420000, date: TODAY, label: 'Ajustement' }, NOW),
    ]);

    expect((await balances(db))[PRO]).toBe(420000);
    const adjustment = await getTransaction(db, 'adj-1');
    expect(adjustment).toMatchObject({ kind: 'adjustment', amountCents: 423500 });

    // Les transactions suivantes font évoluer le solde à partir de la valeur corrigée.
    await db.batch(buildCreateTransactionBatch(expense(20000), ctx));
    expect((await balances(db))[PRO]).toBe(400000);
  });

  it('ne crée rien si le solde saisi est déjà le bon', async () => {
    const { db } = createTestDb();
    await db.batch([
      adjustBalanceStatement({ id: 'adj-1', accountId: PERSO, targetCents: 0, date: TODAY, label: 'Solde initial' }, NOW),
    ]);
    expect(await db.query('SELECT id FROM transactions')).toEqual([]);
  });

  it('accepte un solde négatif (découvert)', async () => {
    const { db } = createTestDb();
    await db.batch([
      adjustBalanceStatement({ id: 'adj-1', accountId: PERSO, targetCents: -12050, date: TODAY, label: 'Solde initial' }, NOW),
    ]);
    expect((await balances(db))[PERSO]).toBe(-12050);
  });
});

describe('virements (P6)', () => {
  it('écrit deux lignes liées dans un seul lot', async () => {
    const { db } = createTestDb();
    await db.batch(buildCreateTransactionBatch(transfer(50000), context()));

    const rows = await db.query<{ accountId: string; amountCents: number; transferGroup: string; label: string }>(
      'SELECT account_id, amount_cents, transfer_group, label FROM transactions ORDER BY amount_cents',
    );
    expect(rows).toEqual([
      { accountId: PRO, amountCents: -50000, transferGroup: 'id-1', label: 'Virement' },
      { accountId: PERSO, amountCents: 50000, transferGroup: 'id-1', label: 'Virement' },
    ]);
    expect(await balances(db)).toEqual({ [PRO]: -50000, [PERSO]: 50000 });
  });

  it('n’écrit aucune ligne si l’une des deux échoue', async () => {
    const { db } = createTestDb();
    const statements = buildCreateTransactionBatch({ ...transfer(50000), toAccountId: 'compte-inconnu' }, context());
    await expect(db.batch(statements)).rejects.toThrow(/FOREIGN KEY/);
    expect(await db.query('SELECT id FROM transactions')).toEqual([]);
  });

  it('n’apparaît qu’une fois dans la liste, et des deux côtés quand on filtre par compte', async () => {
    const { db } = createTestDb();
    await db.batch(buildCreateTransactionBatch(transfer(50000), context()));

    const all = await listTransactions(db, { month: '2026-09' });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ accountId: PRO, peerAccountId: PERSO, amountCents: -50000 });

    const perso = await listTransactions(db, { month: '2026-09', accountId: PERSO });
    expect(perso[0]).toMatchObject({ amountCents: 50000, peerAccountId: PRO });
  });

  it('se modifie et se supprime comme un tout', async () => {
    const { db } = createTestDb();
    const ctx = context();
    await db.batch(buildCreateTransactionBatch(transfer(50000), ctx));
    const [item] = await listTransactions(db, { month: '2026-09' });

    await db.batch(buildUpdateTransactionBatch(item!, { ...transfer(80000), date: '2026-09-20' }, ctx));
    expect(await balances(db)).toEqual({ [PRO]: -80000, [PERSO]: 80000 });
    expect(await db.query('SELECT id FROM transactions')).toHaveLength(2);

    // Supprimer depuis le côté « arrivée » retire aussi le côté « départ ».
    const [incoming] = await listTransactions(db, { month: '2026-09', accountId: PERSO });
    await db.batch([deleteTransactionStatement(deletionTarget(incoming!))]);
    expect(await db.query('SELECT id FROM transactions')).toEqual([]);
  });
});

describe('encaissements reçus (P4)', () => {
  it('un encaissement reçu avec sa transaction n’est compté qu’une fois', async () => {
    const { db } = createTestDb();
    const { projectId, deposit } = await projectWithSchedule(db);

    const { transactionId, statements } = buildReceivePaymentBatch(
      { ...deposit, projectName: 'Site vitrine', clientName: 'Boulangerie Marchal' },
      { receivedDate: TODAY, accountId: PRO },
      context(),
    );
    await db.batch(statements);

    expect(await getTransaction(db, transactionId!)).toMatchObject({
      kind: 'income',
      amountCents: 60000,
      label: 'Acompte 30 %',
      categoryId: 'cat-client-income',
      projectId,
      paymentId: deposit.id,
    });
    expect((await balances(db))[PRO]).toBe(60000);

    const summary = await getFinanceSummary(db, TODAY);
    expect(summary).toMatchObject({ dueCents: 140000, receivedMonthCents: 60000, lateCents: 0 });

    // Côté banque, le revenu du mois ne compte la somme qu'une fois.
    const month = await listTransactions(db, { month: '2026-09', kind: 'income' });
    expect(month.map((t) => t.amountCents)).toEqual([60000]);
  });

  it('annuler la réception supprime la transaction liée, et l’annulation la remet', async () => {
    const { db } = createTestDb();
    const { deposit } = await projectWithSchedule(db);
    const ctx = context();
    await db.batch(buildReceivePaymentBatch(deposit, { receivedDate: TODAY, accountId: PRO }, ctx).statements);

    const snapshot = await snapshotPayment(db, deposit.id);
    await db.batch(buildUnreceivePaymentBatch(deposit.id, ctx));

    expect(await getPayment(db, deposit.id)).toMatchObject({ status: 'planned', receivedDate: null, transactionId: null });
    expect(await db.query('SELECT id FROM transactions')).toEqual([]);
    expect((await balances(db))[PRO]).toBe(0);

    await db.batch(buildRestoreReceptionBatch(snapshot!, NOW));
    expect(await getPayment(db, deposit.id)).toMatchObject({ status: 'received', receivedDate: TODAY });
    expect((await balances(db))[PRO]).toBe(60000);
  });

  it('peut être reçu sans créer de transaction', async () => {
    const { db } = createTestDb();
    const { deposit } = await projectWithSchedule(db);
    await db.batch(buildReceivePaymentBatch(deposit, { receivedDate: TODAY, accountId: null }, context()).statements);

    expect(await getPayment(db, deposit.id)).toMatchObject({ status: 'received', transactionId: null });
    expect((await balances(db))[PRO]).toBe(0);
  });

  it('reporte le montant et la date de réception sur la transaction liée', async () => {
    const { db } = createTestDb();
    const { deposit } = await projectWithSchedule(db);
    const ctx = context();
    const { transactionId, statements } = buildReceivePaymentBatch(deposit, { receivedDate: TODAY, accountId: PRO }, ctx);
    await db.batch(statements);

    const received = (await getPayment(db, deposit.id))!;
    const input: PaymentInput = {
      label: received.label,
      amountCents: 65000,
      dueDate: received.dueDate,
      status: 'planned',
      projectId: received.projectId,
      client: { kind: 'none' },
      invoiceRef: 'F-2026-003',
      notes: null,
      receivedDate: '2026-09-22',
    };
    await db.batch(buildUpdatePaymentBatch(received, input, ctx));

    expect(await getPayment(db, deposit.id)).toMatchObject({ amountCents: 65000, receivedDate: '2026-09-22', invoiceRef: 'F-2026-003' });
    expect(await getTransaction(db, transactionId!)).toMatchObject({ amountCents: 65000, date: '2026-09-22' });
  });

  it('supprime l’encaissement avec sa transaction, et l’annulation remet les deux', async () => {
    const { db } = createTestDb();
    const { deposit } = await projectWithSchedule(db);
    await db.batch(buildReceivePaymentBatch(deposit, { receivedDate: TODAY, accountId: PRO }, context()).statements);

    const snapshot = await snapshotPayment(db, deposit.id);
    await db.batch(buildDeletePaymentBatch(deposit.id));
    expect(await getPayment(db, deposit.id)).toBeUndefined();
    expect((await balances(db))[PRO]).toBe(0);

    await db.batch(buildRestorePaymentBatch(snapshot!, NOW));
    expect(await getPayment(db, deposit.id)).toMatchObject({ status: 'received', transactionId: expect.any(String) });
    expect((await balances(db))[PRO]).toBe(60000);
  });
});

describe('encaissements sans projet', () => {
  it('se rattachent à un client, créé à la volée', async () => {
    const { db } = createTestDb();
    const { paymentId, statements } = buildCreatePaymentBatch(
      {
        label: 'Facture logo',
        amountCents: 45000,
        dueDate: '2026-09-20',
        status: 'pending',
        projectId: null,
        client: { kind: 'new', name: 'Studio Lumen' },
        invoiceRef: 'F-12',
        notes: null,
      },
      context(),
    );
    await db.batch(statements);

    expect(await getPayment(db, paymentId)).toMatchObject({
      clientName: 'Studio Lumen',
      projectId: null,
      status: 'pending',
      invoiceRef: 'F-12',
    });
    expect(await listOpenPayments(db)).toHaveLength(1);
    expect(await getFinanceSummary(db, TODAY)).toMatchObject({ dueCents: 45000, lateCents: 45000, lateCount: 1 });
  });
});

describe('chiffres du mois', () => {
  it('les dépenses pro du mois excluent virements, ajustements, compte perso et autres mois', async () => {
    const { db } = createTestDb();
    const ctx = context();
    await db.batch([
      adjustBalanceStatement({ id: 'adj', accountId: PRO, targetCents: 500000, date: TODAY, label: 'Solde initial' }, NOW),
      ...buildCreateTransactionBatch(expense(3500), ctx),
      ...buildCreateTransactionBatch(expense(12000, PRO, '2026-09-02'), ctx),
      ...buildCreateTransactionBatch(expense(9900, PRO, '2026-08-31'), ctx),
      ...buildCreateTransactionBatch(expense(2500, PERSO), ctx),
      ...buildCreateTransactionBatch(transfer(100000), ctx),
    ]);

    const summary = await getFinanceSummary(db, TODAY);
    expect(summary.businessExpenseMonthCents).toBe(-15500);

    const pro = summary.accounts.find((a) => a.id === PRO)!;
    expect(pro).toMatchObject({ monthExpenseCents: -15500, monthChangeCents: -115500 });
    const perso = summary.accounts.find((a) => a.id === PERSO)!;
    expect(perso).toMatchObject({ monthExpenseCents: -2500, monthChangeCents: 97500 });
    // Le compte pro est présenté en premier.
    expect(summary.accounts.map((a) => a.id)).toEqual([PRO, PERSO]);
  });

  it('le prévu couvre les 30 prochains jours, hors retards', async () => {
    const { db } = createTestDb();
    await projectWithSchedule(db); // acompte le 01/09 (en retard), solde le 10/10
    const summary = await getFinanceSummary(db, TODAY);
    expect(summary).toMatchObject({ dueCents: 200000, lateCents: 60000, upcomingCents: 140000 });
  });
});

describe('fiche projet', () => {
  it('liste les dépenses liées au projet', async () => {
    const { db } = createTestDb();
    const { projectId } = await projectWithSchedule(db);
    const ctx = context();
    await db.batch([
      ...buildCreateTransactionBatch({ ...expense(4000), label: 'Photos', projectId }, ctx),
      ...buildCreateTransactionBatch(expense(1000), ctx),
    ]);
    const expenses = await listProjectExpenses(db, projectId);
    expect(expenses.map((t) => [t.label, t.amountCents, t.projectName])).toEqual([['Photos', -4000, 'Site vitrine']]);
  });
});

describe('catégories', () => {
  it('supprimer une catégorie garde ses transactions, sans catégorie', async () => {
    const { db } = createTestDb();
    await db.batch(buildCreateTransactionBatch(expense(3500), context()));
    await db.batch([sql`DELETE FROM transaction_categories WHERE id = 'cat-software'`]);
    const [item] = await listTransactions(db, { month: '2026-09' });
    expect(item).toMatchObject({ categoryId: null, categoryName: null, amountCents: -3500 });
  });
});
