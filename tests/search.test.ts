import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { withoutFts5 } from '@/core/db/fts-fallback';
import type { Db } from '@/core/db/types';
import { groupResults, searchTerms, toMatchQuery, type SearchResult } from '@/domains/search/model';
import { searchEverything } from '@/domains/search/repository';
import { createTestDb, readMigrations } from './support/test-db';

const NOW = '2026-09-24T10:00:00.000Z';
const TODAY = '2026-09-24';

/** Un client, deux projets (dont un à lui), des tâches, un événement, des encaissements, un virement. */
async function seed(db: Db) {
  await db.batch([
    sql`INSERT INTO clients (id, name, email, created_at, updated_at)
        VALUES ('c1', 'Boulangerie Marchal', 'contact@marchal.fr', ${NOW}, ${NOW})`,
    sql`INSERT INTO projects (id, name, description, client_id, type_id, status, deadline, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'Refonte complète', 'c1', 'type-freelance', 'active', '2026-10-10', ${NOW}, ${NOW}),
               ('p2', 'Dossier de bourse', NULL, NULL, 'type-personnel', 'active', '2026-10-30', ${NOW}, ${NOW})`,
    sql`INSERT INTO tasks (id, project_id, title, notes, status, due_date, sort_order, created_at, updated_at)
        VALUES ('k1', 'p1', 'Maquette de la page d''accueil', NULL, 'todo', '2026-09-30', 1, ${NOW}, ${NOW}),
               ('k2', 'p1', 'Envoyer la facture', 'Échéance à vérifier', 'done', NULL, 2, ${NOW}, ${NOW}),
               ('k3', NULL, 'Appeler la banque', NULL, 'todo', NULL, 3, ${NOW}, ${NOW})`,
    sql`INSERT INTO events (id, title, kind, all_day, starts_at, location, project_id, created_at, updated_at)
        VALUES ('e1', 'Rendez-vous Marchal', 'meeting', 0, '2026-09-28T14:00', 'Boulangerie', 'p1', ${NOW}, ${NOW}),
               ('e2', 'Échéance dossier', 'deadline', 1, '2026-10-30', NULL, NULL, ${NOW}, ${NOW})`,
    sql`INSERT INTO payments (id, project_id, label, amount_cents, due_date, status, created_at, updated_at)
        VALUES ('m1', 'p1', 'Acompte', 60000, '2026-09-25', 'planned', ${NOW}, ${NOW})`,
    sql`INSERT INTO payments (id, client_id, label, amount_cents, due_date, status, invoice_ref, created_at, updated_at)
        VALUES ('m2', 'c1', 'Logo', 30000, '2026-11-01', 'pending', 'F-2026-014', ${NOW}, ${NOW})`,
    sql`INSERT INTO transactions (id, account_id, kind, amount_cents, date, label, transfer_group, created_at, updated_at)
        VALUES ('t1', 'account-business', 'transfer', -50000, '2026-09-05', 'Salaire septembre', 'v1', ${NOW}, ${NOW}),
               ('t2', 'account-personal', 'transfer', 50000, '2026-09-05', 'Salaire septembre', 'v1', ${NOW}, ${NOW})`,
  ]);
}

const ids = (results: SearchResult[], entity?: SearchResult['entity']) =>
  results.filter((r) => !entity || r.entity === entity).map((r) => r.id);

describe('règles de recherche', () => {
  it('découpe le texte en mots comme le tokenizer', () => {
    expect(searchTerms("  l'app  Marchal-2026 ")).toEqual(['l', 'app', 'Marchal', '2026']);
    expect(searchTerms('" * : ( )')).toEqual([]);
  });

  it('fait de chaque mot un préfixe obligatoire', () => {
    expect(toMatchQuery(['marc', 'ech'])).toBe('"marc"* "ech"*');
  });

  it('met en tête le groupe de la meilleure correspondance', () => {
    const result = (entity: SearchResult['entity'], score: number | null, direct = true): SearchResult => ({
      entity,
      id: `${entity}-${score}`,
      title: '',
      context: null,
      color: null,
      date: null,
      amountCents: null,
      closed: false,
      direct,
      score,
    });
    const groups = groupResults([
      result('project', null, false),
      result('task', -2),
      result('client', -8),
    ]);
    expect(groups.map((g) => g.entity)).toEqual(['client', 'task', 'project']);
    expect(groups[0]?.label).toBe('Clients');
  });
});

describe('recherche globale (FTS5)', () => {
  it('trouve par préfixe et sans tenir compte des accents', async () => {
    const { db } = createTestDb();
    await seed(db);

    expect(ids(await searchEverything(db, 'marc', TODAY), 'client')).toEqual(['c1']);
    expect(ids(await searchEverything(db, 'echeance', TODAY), 'event')).toEqual(['e2']);
    // Les notes comptent aussi : « Échéance à vérifier » est dans les notes de k2.
    expect(ids(await searchEverything(db, 'echeance', TODAY), 'task')).toEqual(['k2']);
    expect(ids(await searchEverything(db, 'F-2026', TODAY), 'payment')).toEqual(['m2']);
    expect(await searchEverything(db, '   ', TODAY)).toEqual([]);
  });

  it('exige tous les mots', async () => {
    const { db } = createTestDb();
    await seed(db);
    expect(ids(await searchEverything(db, 'maquette accueil', TODAY), 'task')).toEqual(['k1']);
    expect(ids(await searchEverything(db, 'maquette banque', TODAY))).toEqual([]);
  });

  it('fait remonter les éléments liés à un client trouvé', async () => {
    const { db } = createTestDb();
    await seed(db);
    const results = await searchEverything(db, 'boulangerie', TODAY);

    const client = results.find((r) => r.entity === 'client');
    expect(client).toMatchObject({ id: 'c1', title: 'Boulangerie Marchal', direct: true });
    // Son projet, les tâches et l'encaissement du projet, son encaissement sans projet.
    expect(ids(results, 'project')).toEqual(['p1']);
    expect(ids(results, 'payment').sort()).toEqual(['m1', 'm2']);
    // Tâche ouverte avant tâche terminée.
    expect(ids(results, 'task')).toEqual(['k1', 'k2']);
    // L'événement correspond directement (lieu « Boulangerie ») : il passe en premier.
    expect(results.find((r) => r.id === 'e1')).toMatchObject({ direct: true, context: 'Site vitrine' });
    // Rien d'étranger au client.
    expect(ids(results)).not.toContain('p2');
    expect(ids(results)).not.toContain('k3');
  });

  it('décrit chaque résultat pour la palette', async () => {
    const { db } = createTestDb();
    await seed(db);
    const results = await searchEverything(db, 'site vitrine', TODAY);

    expect(results.find((r) => r.id === 'p1')).toMatchObject({
      entity: 'project',
      title: 'Site vitrine',
      context: 'Boulangerie Marchal',
      color: 'blue',
      date: '2026-10-10',
      closed: false,
      direct: true,
    });
    expect(results.find((r) => r.id === 'm1')).toMatchObject({
      context: 'Site vitrine',
      amountCents: 60000,
      date: '2026-09-25',
      direct: false,
    });
    expect(results.find((r) => r.id === 'k2')).toMatchObject({ closed: true });
  });

  it('montre un virement une seule fois', async () => {
    const { db } = createTestDb();
    await seed(db);
    const results = await searchEverything(db, 'salaire', TODAY);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ entity: 'transaction', id: 't1', context: 'Compte professionnel' });
  });

  it('suit les modifications et les suppressions, cascades comprises', async () => {
    const { db } = createTestDb();
    await seed(db);

    await db.batch([sql`UPDATE tasks SET title = 'Maquette mobile' WHERE id = 'k1'`]);
    expect(ids(await searchEverything(db, 'accueil', TODAY))).toEqual([]);
    expect(ids(await searchEverything(db, 'mobile', TODAY), 'task')).toEqual(['k1']);

    // Cocher une tâche ne touche pas l'index.
    await db.batch([sql`UPDATE tasks SET status = 'done' WHERE id = 'k1'`]);
    expect(ids(await searchEverything(db, 'mobile', TODAY), 'task')).toEqual(['k1']);

    // Supprimer le projet supprime ses tâches (cascade) : elles sortent de l'index.
    await db.batch([
      sql`DELETE FROM payments WHERE project_id = 'p1'`,
      sql`DELETE FROM projects WHERE id = 'p1'`,
    ]);
    expect(ids(await searchEverything(db, 'mobile', TODAY))).toEqual([]);
    expect(ids(await searchEverything(db, 'vitrine', TODAY))).toEqual([]);
    const count = await db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM search_index WHERE entity = 'task'");
    expect(count?.n).toBe(1);
  });

  it('indexe les données saisies avant la migration', async () => {
    const { db, raw } = createTestDb({ migrations: 1 });
    await seed(db);
    const [, search] = readMigrations();
    raw.exec(search!);

    expect(ids(await searchEverything(db, 'marchal', TODAY), 'client')).toEqual(['c1']);
    expect(ids(await searchEverything(db, 'salaire', TODAY))).toEqual(['t1']);
  });
});

describe('recherche sans FTS5 (navigateur de développement)', () => {
  it('remplace la table virtuelle par une table ordinaire', () => {
    const migration = readMigrations()[1]!;
    const converted = withoutFts5(migration);
    expect(converted).toContain('CREATE TABLE search_index (entity, entity_id, title, body);');
    expect(converted).not.toMatch(/fts5/i);
  });

  it('cherche par LIKE avec les mêmes résultats liés', async () => {
    const { db } = createTestDb({ fts: false });
    await seed(db);
    const results = await searchEverything(db, 'Marchal', TODAY);
    expect(ids(results, 'client')).toEqual(['c1']);
    expect(ids(results, 'project')).toEqual(['p1']);
  });
});
