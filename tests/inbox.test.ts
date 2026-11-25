import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import type { NewEventInput } from '@/domains/agenda/model';
import { getEvent } from '@/domains/agenda/repository';
import { listProjectIdeas } from '@/domains/ideas/repository';
import {
  CAPTURE_SHORTCUT,
  CAPTURE_SHORTCUTS,
  NO_CAPTURE_SHORTCUT,
  capturedLabel,
  cleanInboxText,
  inboxCountLabel,
  resolveCaptureShortcut,
} from '@/domains/inbox/model';
import {
  deleteInboxItemStatement,
  getInboxItem,
  insertInboxItemStatement,
  listInboxItems,
  restoreInboxItemStatement,
  updateInboxTextStatement,
} from '@/domains/inbox/repository';
import {
  buildInboxToEventBatch,
  buildInboxToIdeaBatch,
  buildInboxToTaskBatch,
  buildUndoTriageBatch,
} from '@/domains/inbox/service';
import { searchEverything } from '@/domains/search/repository';
import type { NewTaskInput } from '@/domains/tasks/model';
import { getTask, listOpenTasks, listProjectTasks } from '@/domains/tasks/repository';
import { createTestDb, readMigrations } from './support/test-db';

const NOW = '2026-11-25T10:00:00.000Z';
const LATER = '2026-11-25T11:00:00.000Z';
const TODAY = '2026-11-25';
const ctx = (id: string) => ({ now: LATER, today: TODAY, newId: () => id });

/** Un projet en cours et trois captures, notées à une heure d'intervalle. */
async function seed(options: { fts?: boolean } = {}) {
  const { db } = createTestDb(options);
  await db.batch([
    sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW})`,
    sql`INSERT INTO tasks (id, project_id, title, status, sort_order, created_at, updated_at)
        VALUES ('k1', 'p1', 'Maquette', 'todo', 1, ${NOW}, ${NOW})`,
    insertInboxItemStatement({ id: 'n1', text: 'Rappeler Marc pour le devis' }, '2026-11-25T08:00:00.000Z'),
    insertInboxItemStatement({ id: 'n2', text: 'Page tarifs avec un simulateur' }, '2026-11-25T09:00:00.000Z'),
    insertInboxItemStatement({ id: 'n3', text: 'Dentiste le 12 à 14 h' }, NOW),
  ]);
  return db;
}

const task = (overrides: Partial<NewTaskInput> = {}): NewTaskInput => ({
  title: 'Rappeler Marc pour le devis',
  projectId: null,
  scheduledDate: TODAY,
  dueDate: null,
  priority: 1,
  estimateMin: null,
  notes: null,
  ...overrides,
});

const inboxIds = async (db: Awaited<ReturnType<typeof seed>>) => (await listInboxItems(db)).map((item) => item.id);

describe('règles de la boîte de réception', () => {
  it('garde le texte sur une ligne et refuse le vide', () => {
    expect(cleanInboxText('  Rappeler   Marc \n pour le devis ')).toBe('Rappeler Marc pour le devis');
    expect(cleanInboxText(' \n ')).toBeNull();
  });

  it('dit depuis quand une capture attend', () => {
    // Heures locales : la capture et « maintenant » sont construits de la même façon.
    const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
    const captured = (day: number, hour: number, minute = 0) => at(day, hour, minute).toISOString();
    const now = at(25, 15, 30);

    expect(capturedLabel(captured(25, 15, 30), now)).toBe('à l’instant');
    expect(capturedLabel(captured(25, 15, 18), now)).toBe('il y a 12 min');
    expect(capturedLabel(captured(25, 13, 10), now)).toBe('il y a 2 h');
    expect(capturedLabel(captured(24, 23, 50), now)).toBe('hier');
    expect(capturedLabel(captured(23, 9), now)).toBe('lun.');
    expect(capturedLabel(captured(10, 9), now)).toBe('10 nov.');
    expect(capturedLabel(new Date(2025, 11, 31, 9).toISOString(), now)).toBe('31 déc. 2025');
    expect(capturedLabel('pas une date', now)).toBe('');
  });

  it('compte ce qui reste à trier', () => {
    expect(inboxCountLabel(0)).toBeNull();
    expect(inboxCountLabel(1)).toBe('1 à trier');
    expect(inboxCountLabel(3)).toBe('3 à trier');
  });

  it('garde un raccourci de capture connu, sinon celui par défaut', () => {
    expect(CAPTURE_SHORTCUT.fallback).toBe('Ctrl+Shift+Space');
    expect(resolveCaptureShortcut('Alt+Shift+C')).toBe('Alt+Shift+C');
    expect(resolveCaptureShortcut(NO_CAPTURE_SHORTCUT)).toBe('none');
    // Jamais Ctrl+Alt (AltGr en AZERTY), ni une valeur modifiée à la main.
    expect(resolveCaptureShortcut('Ctrl+Alt+Space')).toBe('Ctrl+Shift+Space');
    expect(resolveCaptureShortcut(null)).toBe('Ctrl+Shift+Space');
    expect(CAPTURE_SHORTCUTS.every((choice) => !choice.value.includes('Ctrl+Alt'))).toBe(true);
  });
});

describe('captures', () => {
  it('sont listées de la plus récente à la plus ancienne', async () => {
    const db = await seed();
    expect(await inboxIds(db)).toEqual(['n3', 'n2', 'n1']);
    expect(await getInboxItem(db, 'n3')).toEqual({ id: 'n3', text: 'Dentiste le 12 à 14 h', createdAt: NOW });
  });

  it('se reformulent sans changer de place', async () => {
    const db = await seed();
    await db.batch([updateInboxTextStatement('n1', 'Rappeler Marc lundi', LATER)]);
    expect(await getInboxItem(db, 'n1')).toMatchObject({ text: 'Rappeler Marc lundi', createdAt: '2026-11-25T08:00:00.000Z' });
    expect(await inboxIds(db)).toEqual(['n3', 'n2', 'n1']);
  });

  it('se suppriment et reviennent à leur place (annulation)', async () => {
    const db = await seed();
    const item = (await getInboxItem(db, 'n2'))!;
    await db.batch([deleteInboxItemStatement('n2')]);
    expect(await inboxIds(db)).toEqual(['n3', 'n1']);

    await db.batch([restoreInboxItemStatement(item, LATER)]);
    expect(await inboxIds(db)).toEqual(['n3', 'n2', 'n1']);
    expect(await getInboxItem(db, 'n2')).toEqual(item);
  });
});

describe('trier une capture', () => {
  it('en tâche libre prévue aujourd’hui : elle quitte la boîte dans le même lot', async () => {
    const db = await seed();
    const item = (await getInboxItem(db, 'n1'))!;
    const { taskId, statements } = buildInboxToTaskBatch(item, task(), ctx('k2'));
    await db.batch(statements);

    expect(taskId).toBe('k2');
    expect(await getTask(db, 'k2')).toMatchObject({
      title: 'Rappeler Marc pour le devis',
      projectId: null,
      scheduledDate: TODAY,
      status: 'todo',
    });
    expect(await inboxIds(db)).toEqual(['n3', 'n2']);
  });

  it('en tâche d’un projet, avec le titre retouché dans la fenêtre', async () => {
    const db = await seed();
    const item = (await getInboxItem(db, 'n1'))!;
    const input = task({ title: 'Relancer Marc', projectId: 'p1', scheduledDate: null, dueDate: '2026-11-30' });
    await db.batch(buildInboxToTaskBatch(item, input, ctx('k2')).statements);

    expect((await listProjectTasks(db, 'p1')).map((t) => t.title)).toEqual(['Maquette', 'Relancer Marc']);
    expect(await getTask(db, 'k2')).toMatchObject({ dueDate: '2026-11-30', scheduledDate: null });
  });

  it('rien ne change si la tâche ne peut pas être créée', async () => {
    const db = await seed();
    const item = (await getInboxItem(db, 'n1'))!;
    const { statements } = buildInboxToTaskBatch(item, task({ projectId: 'projet-inconnu' }), ctx('k2'));
    await expect(db.batch(statements)).rejects.toThrow(/FOREIGN KEY/);
    expect(await inboxIds(db)).toEqual(['n3', 'n2', 'n1']);
    expect((await listOpenTasks(db)).map((t) => t.id)).toEqual(['k1']);
  });

  it('en idée du projet choisi', async () => {
    const db = await seed();
    const item = (await getInboxItem(db, 'n2'))!;
    const { ideaId, statements } = buildInboxToIdeaBatch(item, 'p1', ctx('i1'));
    await db.batch(statements);

    expect(ideaId).toBe('i1');
    expect(await listProjectIdeas(db, 'p1')).toEqual([
      { id: 'i1', projectId: 'p1', title: 'Page tarifs avec un simulateur', createdAt: LATER },
    ]);
    expect(await inboxIds(db)).toEqual(['n3', 'n1']);
  });

  it('en événement', async () => {
    const db = await seed();
    const item = (await getInboxItem(db, 'n3'))!;
    const input: NewEventInput = {
      title: 'Dentiste',
      kind: 'appointment',
      timing: { date: '2026-12-12', allDay: false, endDate: null, startTime: '14:00', endTime: '15:00' },
      location: null,
      notes: null,
      projectId: null,
    };
    const { eventId, statements } = buildInboxToEventBatch(item, input, ctx('e1'));
    await db.batch(statements);

    expect(eventId).toBe('e1');
    expect(await getEvent(db, 'e1')).toMatchObject({
      title: 'Dentiste',
      allDay: false,
      startsAt: '2026-12-12T14:00',
      endsAt: '2026-12-12T15:00',
    });
    expect(await inboxIds(db)).toEqual(['n2', 'n1']);
  });

  it('« Annuler » retire ce qui a été créé et remet la capture à sa place', async () => {
    const db = await seed();
    const item = (await getInboxItem(db, 'n2'))!;

    const asTask = buildInboxToTaskBatch(item, task({ title: item.text }), ctx('k2'));
    await db.batch(asTask.statements);
    await db.batch(buildUndoTriageBatch(item, { kind: 'task', id: asTask.taskId }, LATER));
    expect(await getTask(db, 'k2')).toBeUndefined();
    expect(await inboxIds(db)).toEqual(['n3', 'n2', 'n1']);

    const asIdea = buildInboxToIdeaBatch(item, 'p1', ctx('i1'));
    await db.batch(asIdea.statements);
    await db.batch(buildUndoTriageBatch(item, { kind: 'idea', id: asIdea.ideaId }, LATER));
    expect(await listProjectIdeas(db, 'p1')).toEqual([]);
    expect(await getInboxItem(db, 'n2')).toEqual(item);
  });
});

describe('recherche', () => {
  it('trouve une capture par son texte, sans tenir compte des accents', async () => {
    const db = await seed();
    const results = await searchEverything(db, 'simul', TODAY);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ entity: 'inbox', id: 'n2', title: 'Page tarifs avec un simulateur', direct: true });
    expect((await searchEverything(db, 'a 14', TODAY)).map((r) => r.id)).toEqual(['n3']);
  });

  it('suit les reformulations, les suppressions et le tri', async () => {
    const db = await seed();
    await db.batch([updateInboxTextStatement('n1', 'Relancer Paul', LATER)]);
    expect(await searchEverything(db, 'marc', TODAY)).toEqual([]);
    expect((await searchEverything(db, 'paul', TODAY)).map((r) => r.id)).toEqual(['n1']);

    await db.batch([deleteInboxItemStatement('n1')]);
    expect(await searchEverything(db, 'paul', TODAY)).toEqual([]);

    // Triée en tâche : on la retrouve comme tâche, plus comme capture.
    const item = (await getInboxItem(db, 'n3'))!;
    await db.batch(buildInboxToTaskBatch(item, task({ title: item.text }), ctx('k2')).statements);
    expect((await searchEverything(db, 'dentiste', TODAY)).map((r) => `${r.entity}:${r.id}`)).toEqual(['task:k2']);
    const count = await db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM search_index WHERE entity = 'inbox'");
    expect(count?.n).toBe(1);
  });

  it('marche aussi sans FTS5 (navigateur de développement)', async () => {
    const db = await seed({ fts: false });
    expect((await searchEverything(db, 'devis', TODAY)).map((r) => `${r.entity}:${r.id}`)).toEqual(['inbox:n1']);
  });
});

describe('migration 0006', () => {
  it('ajoute une boîte vide à une base existante, sans toucher au reste', async () => {
    const { db, raw } = createTestDb({ migrations: 5 });
    await db.batch([
      sql`INSERT INTO tasks (id, title, sort_order, created_at, updated_at) VALUES ('x', 'Vieille tâche', 1, ${NOW}, ${NOW})`,
    ]);
    raw.exec(readMigrations()[5]!);

    expect(await listInboxItems(db)).toEqual([]);
    expect((await getTask(db, 'x'))?.title).toBe('Vieille tâche');
    await db.batch([insertInboxItemStatement({ id: 'n1', text: 'Première capture' }, NOW)]);
    expect((await searchEverything(db, 'capture', TODAY)).map((r) => r.id)).toEqual(['n1']);
  });
});
