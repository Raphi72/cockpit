import { describe, expect, it } from 'vitest';
import { archiveBlocker } from '@/domains/finance/accounts/model';
import {
  adjustBalanceStatement,
  insertAccountStatement,
  listAccounts,
  listManagedAccounts,
  setAccountArchivedStatement,
  updateAccountStatement,
} from '@/domains/finance/accounts/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-26T10:00:00.000Z';

describe('comptes (Paramètres › Comptes)', () => {
  it('ajoute un compte après les autres, le renomme et change son type', async () => {
    const { db } = createTestDb();
    await db.batch([insertAccountStatement({ id: 'livret', name: 'Livret A', kind: 'personal' }, NOW)]);
    expect((await listAccounts(db)).map((a) => a.name)).toEqual(['Compte professionnel', 'Compte personnel', 'Livret A']);

    await db.batch([updateAccountStatement('livret', { name: 'Épargne' })]);
    await db.batch([updateAccountStatement('livret', { kind: 'business' })]);
    // Les comptes pro d'abord, dans leur ordre de création.
    expect((await listAccounts(db)).map((a) => [a.name, a.kind])).toEqual([
      ['Compte professionnel', 'business'],
      ['Épargne', 'business'],
      ['Compte personnel', 'personal'],
    ]);
  });

  it('un compte archivé sort des soldes et des formulaires, mais reste dans Paramètres avec ses transactions', async () => {
    const { db } = createTestDb();
    await db.batch([insertAccountStatement({ id: 'livret', name: 'Livret A', kind: 'personal' }, NOW)]);
    await db.batch([
      adjustBalanceStatement({ id: 'adj', accountId: 'livret', targetCents: 0, date: '2026-09-26', label: 'Ajustement' }, NOW),
    ]);
    await db.batch([setAccountArchivedStatement('livret', NOW)]);

    expect((await listAccounts(db)).map((a) => a.id)).not.toContain('livret');
    const managed = await listManagedAccounts(db);
    expect(managed.at(-1)).toMatchObject({ id: 'livret', archivedAt: NOW, balanceCents: 0, transactionCount: 0 });

    await db.batch([setAccountArchivedStatement('livret', null)]);
    expect((await listAccounts(db)).map((a) => a.id)).toContain('livret');
  });

  it('refuse d’archiver un compte qui a de l’argent, ou le dernier compte', () => {
    expect(archiveBlocker({ balanceCents: 0 }, 2)).toBeNull();
    expect(archiveBlocker({ balanceCents: 12050 }, 2)).toMatch(/solde doit être à 0/);
    expect(archiveBlocker({ balanceCents: -500 }, 3)).toMatch(/solde doit être à 0/);
    expect(archiveBlocker({ balanceCents: 0 }, 1)).toMatch(/au moins un compte/);
  });
});
