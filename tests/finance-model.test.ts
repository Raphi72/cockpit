import { describe, expect, it } from 'vitest';
import { formatMonth, monthRange, shiftMonth } from '@/core/dates';
import { moneyToInput, parseMoneyInput } from '@/core/money';
import { adjustmentCents, defaultAccountId, otherAccountId } from '@/domains/finance/accounts/model';
import { incomeLabel, isPaymentLate, validatePayment, type PaymentInput } from '@/domains/finance/payments/model';
import {
  inputFromTransaction,
  signedAmount,
  summarizeTransactions,
  transactionLabel,
  validateTransaction,
  type TransactionInput,
  type TransactionListItem,
} from '@/domains/finance/transactions/model';

const TODAY = '2026-09-24';

describe('montants', () => {
  it('accepte un montant négatif seulement quand on le demande', () => {
    expect(parseMoneyInput('-120')).toBeUndefined();
    expect(parseMoneyInput('−120,50', { signed: true })).toBe(-12050);
    expect(parseMoneyInput('1 234,56', { signed: true })).toBe(123456);
    expect(moneyToInput(-12050)).toBe('-120,50');
  });

  it('donne le signe selon le type', () => {
    expect(signedAmount('income', 2000)).toBe(2000);
    expect(signedAmount('expense', 2000)).toBe(-2000);
  });
});

describe('mois', () => {
  it('calcule les bornes et passe d’une année à l’autre', () => {
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', 4)).toBe('2027-01');
  });

  it('nomme le mois, avec l’année seulement si elle diffère', () => {
    expect(formatMonth('2026-09', TODAY)).toBe('Septembre');
    expect(formatMonth('2025-12', TODAY)).toBe('Décembre 2025');
  });
});

describe('comptes', () => {
  it('ne crée un ajustement que s’il y a une différence', () => {
    expect(adjustmentCents(100000, 125000)).toBe(25000);
    expect(adjustmentCents(100000, 90000)).toBe(-10000);
    expect(adjustmentCents(100000, 100000)).toBeNull();
  });

  it('propose le compte pro par défaut, et un autre compte pour un virement', () => {
    const accounts = [
      { id: 'perso', kind: 'personal' as const },
      { id: 'pro', kind: 'business' as const },
    ];
    expect(defaultAccountId(accounts)).toBe('pro');
    expect(otherAccountId(accounts, 'pro')).toBe('perso');
    expect(defaultAccountId([])).toBeNull();
  });
});

describe('transactions', () => {
  const base: TransactionInput = {
    kind: 'expense',
    amountCents: 3500,
    accountId: 'pro',
    toAccountId: null,
    date: TODAY,
    label: 'Figma',
    categoryId: null,
    projectId: null,
    notes: null,
  };

  it('valide la saisie', () => {
    expect(validateTransaction(base)).toEqual({});
    expect(validateTransaction({ ...base, amountCents: null, label: ' ' })).toMatchObject({
      amountCents: expect.any(String),
      label: expect.any(String),
    });
    expect(validateTransaction({ ...base, date: '2026-02-30' })).toHaveProperty('date');
    // Un virement n'a pas besoin de libellé, mais de deux comptes différents.
    expect(validateTransaction({ ...base, kind: 'transfer', label: '', toAccountId: 'pro' })).toEqual({
      toAccountId: 'Choisis deux comptes différents.',
    });
    expect(transactionLabel({ kind: 'transfer', label: ' ' })).toBe('Virement');
  });

  it('pré-remplit un virement depuis n’importe lequel de ses côtés', () => {
    const outgoing = {
      id: 't1',
      kind: 'transfer',
      amountCents: -50000,
      accountId: 'pro',
      peerAccountId: 'perso',
      date: TODAY,
      label: 'Virement',
      categoryId: null,
      projectId: null,
      notes: null,
    } as TransactionListItem;
    const incoming = { ...outgoing, id: 't2', amountCents: 50000, accountId: 'perso', peerAccountId: 'pro' };
    for (const item of [outgoing, incoming]) {
      expect(inputFromTransaction(item)).toMatchObject({ kind: 'transfer', amountCents: 50000, accountId: 'pro', toAccountId: 'perso' });
    }
  });

  it('additionne entrées et sorties, sans virements ni ajustements', () => {
    expect(
      summarizeTransactions([
        { kind: 'income', amountCents: 60000 },
        { kind: 'expense', amountCents: -3500 },
        { kind: 'transfer', amountCents: -50000 },
        { kind: 'adjustment', amountCents: 120000 },
      ]),
    ).toEqual({ incomeCents: 60000, expenseCents: -3500 });
  });
});

describe('encaissements', () => {
  it('n’est en retard que non reçu et après la date prévue', () => {
    expect(isPaymentLate({ status: 'planned', dueDate: '2026-09-20' }, TODAY)).toBe(true);
    expect(isPaymentLate({ status: 'pending', dueDate: TODAY }, TODAY)).toBe(false);
    expect(isPaymentLate({ status: 'received', dueDate: '2026-09-20' }, TODAY)).toBe(false);
    expect(isPaymentLate({ status: 'planned', dueDate: null }, TODAY)).toBe(false);
  });

  it('nomme le revenu créé à la réception', () => {
    // Le projet est rattaché à la transaction (et affiché à côté) : inutile de le répéter.
    expect(incomeLabel({ label: 'Solde', projectName: 'Site vitrine', clientName: 'Marchal' })).toBe('Solde');
    expect(incomeLabel({ label: 'Facture 12', projectName: null, clientName: 'Studio Lumen' })).toBe('Facture 12 · Studio Lumen');
    expect(incomeLabel({ label: 'Don', projectName: null, clientName: null })).toBe('Don');
  });

  it('valide la saisie', () => {
    const input: PaymentInput = {
      label: 'Acompte',
      amountCents: 50000,
      dueDate: null,
      status: 'planned',
      projectId: null,
      client: { kind: 'none' },
      invoiceRef: null,
      notes: null,
    };
    expect(validatePayment(input)).toEqual({});
    expect(validatePayment({ ...input, label: '', amountCents: 0 })).toMatchObject({
      label: expect.any(String),
      amountCents: expect.any(String),
    });
    expect(validatePayment({ ...input, receivedDate: null })).toHaveProperty('receivedDate');
  });
});
