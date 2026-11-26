import { describe, expect, it } from 'vitest';
import { listAgenda } from '@/domains/agenda/repository';
import { groupHomework, homeworkSummary, selectHomeworkDue } from '@/domains/school/homework/model';
import { normalizeSubject } from '@/domains/school/subjects/model';
import { insertSubjectStatement } from '@/domains/school/subjects/repository';
import { exclusiveAttachment, tasksOfMode, taskContext, type NewTaskInput } from '@/domains/tasks/model';
import {
  getTask,
  insertTaskStatement,
  listOpenTasks,
  listParentCandidates,
  updateTaskStatements,
} from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
const TODAY = '2026-11-26';

const base: NewTaskInput = {
  title: 'Devoir',
  projectId: null,
  scheduledDate: null,
  dueDate: null,
  priority: 1,
  estimateMin: null,
  notes: null,
};

async function setup() {
  const { db } = createTestDb();
  const subject = (name: string, color: 'blue' | 'green') =>
    normalizeSubject({ name, color, teacher: '', room: '', coefficient: '1' });
  await db.batch([
    insertSubjectStatement('maths', subject('Maths', 'blue'), NOW),
    insertSubjectStatement('svt', subject('SVT', 'green'), NOW),
    insertTaskStatement('h1', { ...base, title: 'Exercices p. 42', subjectId: 'maths', dueDate: '2026-11-27' }, NOW),
    insertTaskStatement('h2', { ...base, title: 'Exposé', subjectId: 'svt', dueDate: '2026-11-20' }, NOW),
    insertTaskStatement('h3', { ...base, title: 'Lire le chapitre', subjectId: 'maths' }, NOW),
    insertTaskStatement('t1', { ...base, title: 'Facture client', scheduledDate: TODAY }, NOW),
    // Une sous-tâche prend la matière de sa parente, quoi qu'on lui donne.
    insertTaskStatement('h1a', { ...base, title: 'Exercice 3', parentId: 'h1' }, NOW),
  ]);
  return db;
}

describe('devoirs : une tâche rattachée à une matière', () => {
  it('donne la matière aux devoirs et à leurs sous-tâches', async () => {
    const db = await setup();
    expect(await getTask(db, 'h1')).toMatchObject({ subjectId: 'maths', subjectName: 'Maths', subjectColor: 'blue', projectId: null });
    expect(await getTask(db, 'h1a')).toMatchObject({ subjectId: 'maths', parentId: 'h1' });
    expect(taskContext((await getTask(db, 'h1'))!)).toEqual({ name: 'Maths', color: 'blue' });
  });

  it('sépare les tâches des deux modes', async () => {
    const db = await setup();
    const open = await listOpenTasks(db);
    expect(tasksOfMode(open, 'work').map((t) => t.id)).toEqual(['t1']);
    expect(tasksOfMode(open, 'school').map((t) => t.id).sort()).toEqual(['h1', 'h1a', 'h2', 'h3']);
  });

  it('ne garde jamais un projet et une matière ensemble', async () => {
    expect(exclusiveAttachment({ subjectId: 'maths' })).toEqual({ subjectId: 'maths', projectId: null });
    // Rejoindre un projet, c'est quitter la matière et le cours du devoir.
    expect(exclusiveAttachment({ projectId: 'p1' })).toEqual({ projectId: 'p1', subjectId: null, courseEvent: null });
    expect(exclusiveAttachment({ title: 'x' })).toEqual({ title: 'x' });
  });

  it('change de matière avec ses sous-tâches, et ne propose comme parente qu’un devoir de la même matière', async () => {
    const db = await setup();
    await db.batch(updateTaskStatements('h1', { subjectId: 'svt' }, NOW));
    expect(await getTask(db, 'h1a')).toMatchObject({ subjectId: 'svt', parentId: 'h1' });

    const h3 = (await getTask(db, 'h3'))!;
    expect((await listParentCandidates(db, h3)).map((t) => t.id)).toEqual([]);
    await db.batch(updateTaskStatements('h3', { subjectId: 'svt' }, NOW));
    expect((await listParentCandidates(db, (await getTask(db, 'h3'))!)).map((t) => t.id).sort()).toEqual(['h1', 'h2']);

    // Une sous-tâche qu'on change seule de matière quitte sa parente.
    await db.batch(updateTaskStatements('h1a', { subjectId: 'maths' }, NOW));
    expect(await getTask(db, 'h1a')).toMatchObject({ subjectId: 'maths', parentId: null });
  });

  it('montre la matière d’un devoir dans l’agenda', async () => {
    const db = await setup();
    const items = await listAgenda(db, '2026-11-01', '2026-12-01');
    expect(items.find((i) => i.id === 'h1')).toMatchObject({ detail: 'Maths', color: 'blue', subjectId: 'maths' });
    expect(items.every((i) => i.source !== 'task' || i.subjectId !== undefined)).toBe(true);
  });

  it('range les devoirs à rendre : en retard, jour par jour, puis sans date', async () => {
    const db = await setup();
    const open = await listOpenTasks(db);
    const groups = groupHomework(open, TODAY);
    expect(groups.map((g) => [g.heading, g.tasks.map((t) => t.id)])).toEqual([
      ['En retard', ['h2']],
      ['Demain', ['h1', 'h1a']],
      ['Sans date', ['h3']],
    ]);
    expect(groups[0]?.tone).toBe('danger');
    expect(homeworkSummary(open, TODAY)).toBe('3 à rendre · 1 en retard');
    expect(selectHomeworkDue(open, TODAY, 2).map((t) => t.id)).toEqual(['h2', 'h1']);
  });
});
