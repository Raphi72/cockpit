import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { cleanIdeaTitle } from '@/domains/ideas/model';
import {
  deleteIdeaStatement,
  getIdea,
  insertIdeaStatement,
  listProjectIdeas,
  renameIdeaStatement,
  restoreIdeaStatement,
} from '@/domains/ideas/repository';
import { buildIdeaToTaskBatch, buildUndoIdeaToTaskBatch } from '@/domains/ideas/service';
import { getProject } from '@/domains/projects/repository';
import { buildRestoreProjectBatch, deleteProject } from '@/domains/projects/service';
import { listProjectTasks } from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-09-24T10:00:00.000Z';
const LATER = '2026-09-24T11:00:00.000Z';
const TODAY = '2026-09-24';

async function seed() {
  const { db } = createTestDb();
  await db.batch([
    sql`INSERT INTO projects (id, name, type_id, status, created_at, updated_at)
        VALUES ('p1', 'Site vitrine', 'type-freelance', 'active', ${NOW}, ${NOW})`,
    sql`INSERT INTO tasks (id, project_id, title, status, sort_order, created_at, updated_at)
        VALUES ('k1', 'p1', 'Maquette', 'todo', 1, ${NOW}, ${NOW})`,
    insertIdeaStatement({ id: 'i1', projectId: 'p1', title: 'Version anglaise' }, NOW),
    insertIdeaStatement({ id: 'i2', projectId: 'p1', title: 'Mode sombre' }, LATER),
  ]);
  return db;
}

describe('idées de projet', () => {
  it('refuse un titre vide', () => {
    expect(cleanIdeaTitle('  Une idée  ')).toBe('Une idée');
    expect(cleanIdeaTitle('   ')).toBeNull();
  });

  it('les liste dans l’ordre où elles ont été notées', async () => {
    const db = await seed();
    expect((await listProjectIdeas(db, 'p1')).map((i) => i.title)).toEqual(['Version anglaise', 'Mode sombre']);

    await db.batch([renameIdeaStatement('i1', 'Version espagnole', LATER)]);
    expect(await getIdea(db, 'i1')).toMatchObject({ title: 'Version espagnole', projectId: 'p1', createdAt: NOW });
  });

  it('ne comptent pas dans la progression du projet', async () => {
    const db = await seed();
    expect(await getProject(db, 'p1')).toMatchObject({ tasksTotal: 1, tasksDone: 0 });
  });

  it('se suppriment et reviennent à leur place (annulation)', async () => {
    const db = await seed();
    const idea = (await getIdea(db, 'i1'))!;
    await db.batch([deleteIdeaStatement('i1')]);
    expect((await listProjectIdeas(db, 'p1')).map((i) => i.id)).toEqual(['i2']);

    await db.batch([restoreIdeaStatement(idea, LATER)]);
    expect((await listProjectIdeas(db, 'p1')).map((i) => i.id)).toEqual(['i1', 'i2']);
  });
});

describe('une idée devient une tâche', () => {
  it('crée la tâche en fin de liste et retire l’idée, dans le même lot', async () => {
    const db = await seed();
    const idea = (await getIdea(db, 'i2'))!;
    const { taskId, statements } = buildIdeaToTaskBatch(idea, { now: LATER, today: TODAY, newId: () => 'k2' });
    await db.batch(statements);

    expect(taskId).toBe('k2');
    const tasks = await listProjectTasks(db, 'p1');
    expect(tasks.map((t) => t.title)).toEqual(['Maquette', 'Mode sombre']);
    expect(tasks[1]).toMatchObject({ status: 'todo', priority: 1, scheduledDate: null, dueDate: null });
    expect((await listProjectIdeas(db, 'p1')).map((i) => i.id)).toEqual(['i1']);
    expect(await getProject(db, 'p1')).toMatchObject({ tasksTotal: 2 });
  });

  it('« Annuler » retire la tâche et remet l’idée', async () => {
    const db = await seed();
    const idea = (await getIdea(db, 'i1'))!;
    const { taskId, statements } = buildIdeaToTaskBatch(idea, { now: LATER, today: TODAY, newId: () => 'k2' });
    await db.batch(statements);
    await db.batch(buildUndoIdeaToTaskBatch(idea, taskId, LATER));

    expect((await listProjectTasks(db, 'p1')).map((t) => t.id)).toEqual(['k1']);
    expect((await listProjectIdeas(db, 'p1')).map((i) => i.id)).toEqual(['i1', 'i2']);
  });
});

describe('suppression du projet', () => {
  it('emporte ses idées, et « Annuler » les ramène', async () => {
    const db = await seed();
    const result = await deleteProject(db, 'p1');
    if (result.status !== 'deleted') throw new Error('projet non supprimé');
    expect(await listProjectIdeas(db, 'p1')).toEqual([]);

    await db.batch(buildRestoreProjectBatch(result.snapshot, LATER));
    expect((await listProjectIdeas(db, 'p1')).map((i) => i.title)).toEqual(['Version anglaise', 'Mode sombre']);
  });
});
