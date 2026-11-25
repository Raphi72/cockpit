import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import type { Db } from '@/core/db/types';
import {
  buildYearRevenue,
  monthState,
  quarterLabel,
  quarterOf,
  quarterPeriod,
  quarterState,
  resolveRevenueYear,
  revenueCountLabel,
} from '@/domains/finance/model';
import { getFinanceSummary, getFirstRevenueYear, listRevenueByMonth } from '@/domains/finance/repository';
import { FINANCE_VIEWS, validateFinancesSearch } from '@/domains/finance/search';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-25T10:00:00.000Z';
const TODAY = '2026-11-25';

/** Un encaissement, reçu à la date donnée (ou encore attendu). */
const payment = (id: string, amountCents: number, receivedDate: string | null, projectId: string | null = 'p1') =>
  sql`INSERT INTO payments (id, project_id, label, amount_cents, due_date, status, received_date, created_at, updated_at)
      VALUES (${id}, ${projectId}, 'Facture', ${amountCents}, '2026-01-01', ${receivedDate ? 'received' : 'planned'},
              ${receivedDate}, ${NOW}, ${NOW})`;

async function setup(): Promise<Db> {
  const { db } = createTestDb();
  await db.batch([
    sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW}),
               ('p2', 'Refonte', 'type-freelance', 'proposal', ${NOW}, ${NOW})`,
    payment('m1', 120000, '2026-01-15'),
    payment('m2', 80000, '2026-01-31'),
    payment('m3', 45050, '2026-04-01'),
    payment('m4', 200000, '2026-11-03'),
    payment('m5', 60000, '2026-11-20', null),
    // Pas dans le chiffre d'affaires : pas encore reçu.
    payment('m6', 999900, null),
    // L'année d'avant, et celle d'après.
    payment('m7', 30000, '2025-12-31'),
    payment('m8', 70000, '2027-01-01'),
  ]);
  return db;
}

describe('chiffre d’affaires : requête', () => {
  it('additionne les encaissements reçus par mois de réception, pour l’année demandée', async () => {
    const db = await setup();
    expect(await listRevenueByMonth(db, 2026)).toEqual([
      { month: '2026-01', cents: 200000, count: 2 },
      { month: '2026-04', cents: 45050, count: 1 },
      { month: '2026-11', cents: 260000, count: 2 },
    ]);
    expect(await listRevenueByMonth(db, 2025)).toEqual([{ month: '2025-12', cents: 30000, count: 1 }]);
    expect(await listRevenueByMonth(db, 2024)).toEqual([]);
  });

  it('suit la même règle que « Encaissé ce mois »', async () => {
    const db = await setup();
    const summary = await getFinanceSummary(db, TODAY);
    const november = (await listRevenueByMonth(db, 2026)).find((row) => row.month === '2026-11');
    expect(november?.cents).toBe(summary.receivedMonthCents);
  });

  it('compte à la date de réception, pas à la date prévue', async () => {
    const db = await setup();
    // Prévu en janvier, reçu en mars : il compte en mars.
    await db.batch([sql`UPDATE payments SET received_date = '2026-03-10' WHERE id = 'm2'`]);
    const rows = await listRevenueByMonth(db, 2026);
    expect(rows.find((row) => row.month === '2026-01')?.cents).toBe(120000);
    expect(rows.find((row) => row.month === '2026-03')?.cents).toBe(80000);
  });

  it('retrouve la première année qui a des encaissements', async () => {
    const db = await setup();
    expect(await getFirstRevenueYear(db)).toBe(2025);
    const { db: empty } = createTestDb();
    expect(await getFirstRevenueYear(empty)).toBeNull();
  });
});

describe('chiffre d’affaires : année, trimestres et mois', () => {
  it('range les mois dans leurs trimestres, mois vides compris', async () => {
    const db = await setup();
    const year = buildYearRevenue(2026, await listRevenueByMonth(db, 2026));

    expect(year).toMatchObject({ year: 2026, cents: 505050, count: 5 });
    expect(year.quarters.map((q) => [q.quarter, q.cents, q.count])).toEqual([
      [1, 200000, 2],
      [2, 45050, 1],
      [3, 0, 0],
      [4, 260000, 2],
    ]);
    expect(year.quarters[0]!.months).toEqual([
      { month: '2026-01', cents: 200000, count: 2 },
      { month: '2026-02', cents: 0, count: 0 },
      { month: '2026-03', cents: 0, count: 0 },
    ]);
    expect(year.quarters[3]!.months.map((m) => m.month)).toEqual(['2026-10', '2026-11', '2026-12']);
    // Le total de l'année est la somme de ses trimestres, et chaque trimestre celle de ses mois.
    expect(year.quarters.reduce((sum, q) => sum + q.cents, 0)).toBe(year.cents);
  });

  it('ignore les lignes d’une autre année', () => {
    const year = buildYearRevenue(2026, [{ month: '2025-12', cents: 30000, count: 1 }]);
    expect(year.cents).toBe(0);
  });

  it('nomme les trimestres', () => {
    expect([1, 2, 3, 4].map((q) => quarterLabel(q as 1 | 2 | 3 | 4))).toEqual([
      '1er trimestre',
      '2e trimestre',
      '3e trimestre',
      '4e trimestre',
    ]);
    const year = buildYearRevenue(2026, []);
    expect(year.quarters.map((q) => quarterPeriod(q))).toEqual([
      'janvier – mars',
      'avril – juin',
      'juillet – septembre',
      'octobre – décembre',
    ]);
    expect(['2026-01', '2026-03', '2026-04', '2026-12'].map(quarterOf)).toEqual([1, 1, 2, 4]);
  });

  it('distingue le passé, la période en cours et l’avenir', () => {
    expect(monthState('2026-10', TODAY)).toBe('past');
    expect(monthState('2026-11', TODAY)).toBe('current');
    expect(monthState('2026-12', TODAY)).toBe('future');
    const year = buildYearRevenue(2026, []);
    expect(year.quarters.map((q) => quarterState(q, TODAY))).toEqual(['past', 'past', 'past', 'current']);
    expect(buildYearRevenue(2027, []).quarters.map((q) => quarterState(q, TODAY))).toEqual(['future', 'future', 'future', 'future']);
    // Dernier mois d'un trimestre : il est en cours, pas encore passé.
    expect(quarterState(year.quarters[2]!, '2026-09-30')).toBe('current');
  });

  it('compte les encaissements', () => {
    expect(revenueCountLabel(0)).toBeNull();
    expect(revenueCountLabel(1)).toBe('1 encaissement');
    expect(revenueCountLabel(3)).toBe('3 encaissements');
  });
});

describe('chiffre d’affaires : année affichée', () => {
  it('reste entre la première année qui a des encaissements et l’année en cours', () => {
    expect(resolveRevenueYear(undefined, 2025, TODAY)).toBe(2026);
    expect(resolveRevenueYear(2025, 2025, TODAY)).toBe(2025);
    expect(resolveRevenueYear(2019, 2025, TODAY)).toBe(2025);
    expect(resolveRevenueYear(2030, 2025, TODAY)).toBe(2026);
    // Aucun encaissement : seulement l'année en cours.
    expect(resolveRevenueYear(2024, null, TODAY)).toBe(2026);
    expect(resolveRevenueYear(2026.5, 2025, TODAY)).toBe(2026);
  });

  it('garde l’année dans l’URL interne', () => {
    expect(FINANCE_VIEWS).toContain('revenue');
    expect(validateFinancesSearch({ view: 'revenue', year: 2025 })).toMatchObject({ view: 'revenue', year: 2025 });
    expect(validateFinancesSearch({ view: 'revenue', year: 'abc' }).year).toBeUndefined();
    expect(validateFinancesSearch({ view: 'revenue', year: 2025.5 }).year).toBeUndefined();
  });
});
