import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { listProjectTypes } from '@/domains/projects/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-24T10:00:00.000Z';

describe('migration 0001', () => {
  it('crée les données initiales', async () => {
    const { db } = createTestDb();

    const types = await listProjectTypes(db);
    expect(types.map((t) => t.name)).toEqual([
      'Freelance',
      'Mission',
      'Personnel',
      'Scolaire',
      'Associatif',
      'Autre',
    ]);
    expect(types[0]).toEqual({ id: 'type-freelance', name: 'Freelance', color: 'blue', sortOrder: 1 });

    const accounts = await db.query<{ kind: string }>('SELECT kind FROM accounts ORDER BY sort_order');
    expect(accounts.map((a) => a.kind)).toEqual(['personal', 'business']);
  });

  it('calcule les soldes à partir des transactions, ajustements et virements compris', async () => {
    const { db } = createTestDb();
    await db.batch([
      sql`INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, created_at, updated_at)
          VALUES ('t1', 'account-business', 'adjustment', 300000, '2026-09-01', 'Solde initial', ${NOW}, ${NOW})`,
      sql`INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, created_at, updated_at)
          VALUES ('t2', 'account-business', 'expense', -3500, '2026-09-02', 'Adobe', ${NOW}, ${NOW})`,
      sql`INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, transfer_group, created_at, updated_at)
          VALUES ('t3', 'account-business', 'transfer', -50000, '2026-09-05', 'Salaire', 'v1', ${NOW}, ${NOW})`,
      sql`INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, transfer_group, created_at, updated_at)
          VALUES ('t4', 'account-personal', 'transfer', 50000, '2026-09-05', 'Salaire', 'v1', ${NOW}, ${NOW})`,
    ]);

    const balances = await db.query<{ accountId: string; balanceCents: number }>(
      'SELECT account_id, balance_cents FROM account_balances ORDER BY account_id',
    );
    expect(balances).toEqual([
      { accountId: 'account-business', balanceCents: 246500 },
      { accountId: 'account-personal', balanceCents: 50000 },
    ]);
  });

  it('calcule la progression et les montants reçus d’un projet', async () => {
    const { db } = createTestDb();
    await db.batch([
      sql`INSERT INTO projects (id, name, type_id, status, budget_cents, created_at, updated_at)
          VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', 200000, ${NOW}, ${NOW})`,
      sql`INSERT INTO tasks (id, project_id, title, status, sort_order, created_at, updated_at)
          VALUES ('k1', 'p1', 'Maquette', 'done', 1, ${NOW}, ${NOW}),
                 ('k2', 'p1', 'Intégration', 'todo', 2, ${NOW}, ${NOW})`,
      sql`INSERT INTO payments (id, project_id, label, amount_cents, due_date, status, received_date, created_at, updated_at)
          VALUES ('m1', 'p1', 'Acompte', 50000, '2026-09-01', 'received', '2026-09-02', ${NOW}, ${NOW}),
                 ('m2', 'p1', 'Solde', 150000, '2026-10-10', 'planned', NULL, ${NOW}, ${NOW})`,
    ]);

    expect(await db.queryOne('SELECT tasks_total, tasks_done FROM project_progress WHERE project_id = ?', ['p1']))
      .toEqual({ tasksTotal: 2, tasksDone: 1 });
    expect(await db.queryOne('SELECT scheduled_cents, received_cents FROM project_money WHERE project_id = ?', ['p1']))
      .toEqual({ scheduledCents: 200000, receivedCents: 50000 });
  });

  it('refuse les données incohérentes', async () => {
    const { db } = createTestDb();
    const insertTx = (kind: string, amount: number, group: string | null = null) =>
      db.execute(
        `INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, transfer_group, created_at, updated_at)
         VALUES (?, 'account-business', ?, ?, '2026-09-24', 'Test', ?, ?, ?)`,
        [crypto.randomUUID(), kind, amount, group, NOW, NOW],
      );

    await expect(insertTx('expense', 3500)).rejects.toThrow(/CHECK/);
    await expect(insertTx('income', -100)).rejects.toThrow(/CHECK/);
    await expect(insertTx('transfer', 100)).rejects.toThrow(/CHECK/);

    // Un encaissement « reçu » doit avoir une date de réception.
    await expect(
      db.execute(
        `INSERT INTO payments (id, label, amount_cents, status, created_at, updated_at)
         VALUES ('m1', 'Solde', 1000, 'received', ?, ?)`,
        [NOW, NOW],
      ),
    ).rejects.toThrow(/CHECK/);

    // Un projet avec des encaissements ne peut pas être supprimé.
    await db.batch([
      sql`INSERT INTO projects (id, name, type_id, created_at, updated_at) VALUES ('p1', 'X', 'type-mission', ${NOW}, ${NOW})`,
      sql`INSERT INTO payments (id, project_id, label, amount_cents, created_at, updated_at) VALUES ('m2', 'p1', 'Solde', 1000, ${NOW}, ${NOW})`,
    ]);
    await expect(db.execute("DELETE FROM projects WHERE id = 'p1'")).rejects.toThrow(/FOREIGN KEY/);
  });

  it('applique un lot en tout ou rien', async () => {
    const { db } = createTestDb();
    await expect(
      db.batch([
        sql`INSERT INTO clients (id, name, created_at, updated_at) VALUES ('c1', 'Studio Lumen', ${NOW}, ${NOW})`,
        sql`INSERT INTO clients (id, name, created_at, updated_at) VALUES ('c1', 'Doublon', ${NOW}, ${NOW})`,
      ]),
    ).rejects.toThrow();

    expect(await db.query('SELECT id FROM clients')).toEqual([]);
  });
});
