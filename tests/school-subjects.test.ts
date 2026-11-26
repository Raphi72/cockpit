import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import {
  formatDecimal,
  nextSubjectColor,
  normalizeSubject,
  parseDecimal,
  removalSummary,
  validateSubject,
} from '@/domains/school/subjects/model';
import {
  deleteSubjectStatement,
  insertSubjectStatement,
  listSubjects,
  readSubjectSnapshot,
  restoreSubjectStatements,
} from '@/domains/school/subjects/repository';
import { searchEverything } from '@/domains/search/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
const TODAY = '2026-11-26';

const maths = normalizeSubject({ name: ' Maths ', color: 'blue', teacher: 'Mme Martin', room: '', coefficient: '2,5' });

async function withSubject() {
  const { db, raw } = createTestDb();
  await db.batch([
    insertSubjectStatement('s1', maths, NOW),
    sql`INSERT INTO tasks (id, subject_id, title, status, sort_order, due_date, created_at, updated_at)
        VALUES ('h1', 's1', 'Exercices page 42', 'todo', 1, '2026-11-28', ${NOW}, ${NOW}),
               ('h2', 's1', 'Rédaction', 'done', 2, NULL, ${NOW}, ${NOW})`,
    sql`INSERT INTO tasks (id, subject_id, parent_id, title, status, sort_order, created_at, updated_at)
        VALUES ('h1a', 's1', 'h1', 'Exercice 3', 'todo', 1, ${NOW}, ${NOW})`,
    sql`INSERT INTO timetable_slots (id, subject_id, weekday, starts_at, ends_at, created_at, updated_at)
        VALUES ('c1', 's1', 1, '08:00', '10:00', ${NOW}, ${NOW})`,
    sql`INSERT INTO exams (id, subject_id, title, date, created_at, updated_at)
        VALUES ('x1', 's1', 'Contrôle chapitre 3', '2026-12-04', ${NOW}, ${NOW})`,
    sql`INSERT INTO grades (id, subject_id, exam_id, score, out_of, coefficient, date, created_at, updated_at)
        VALUES ('g1', 's1', 'x1', 14.5, 20, 1, '2026-12-04', ${NOW}, ${NOW})`,
  ]);
  return { db, raw };
}

describe('matières : règles', () => {
  it('lit un coefficient écrit à la française', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal(' 2 ')).toBe(2);
    expect(parseDecimal('1.25')).toBe(1.25);
    expect(parseDecimal('deux')).toBeNull();
    expect(parseDecimal('-1')).toBeNull();
    expect(formatDecimal(1.5)).toBe('1,5');
    expect(formatDecimal(2)).toBe('2');
  });

  it('demande un nom et un coefficient positif', () => {
    const base = { name: 'Maths', color: 'blue' as const, teacher: '', room: '', coefficient: '1' };
    expect(validateSubject(base)).toEqual({});
    expect(validateSubject({ ...base, name: '  ' }).name).toBeDefined();
    expect(validateSubject({ ...base, coefficient: '0' }).coefficient).toBeDefined();
    expect(validateSubject({ ...base, coefficient: 'abc' }).coefficient).toBeDefined();
    expect(maths).toEqual({ name: 'Maths', color: 'blue', teacher: 'Mme Martin', room: null, coefficient: 2.5 });
  });

  it('propose une couleur pas encore prise', () => {
    expect(nextSubjectColor([])).toBe('blue');
    expect(nextSubjectColor(['blue', 'violet'])).toBe('pink');
  });

  it('dit ce que la suppression emporte', () => {
    expect(removalSummary({ homework: 0, slots: 0, exams: 0, grades: 0 })).toBe('Matière supprimée.');
    expect(removalSummary({ homework: 3, slots: 0, exams: 1, grades: 2 })).toBe(
      'Matière supprimée, avec 3 devoirs, 1 examen et 2 notes.',
    );
  });
});

describe('matières : base', () => {
  it('liste les matières avec leurs devoirs à rendre (sans les sous-tâches)', async () => {
    const { db } = await withSubject();
    const [subject] = await listSubjects(db);
    expect(subject).toMatchObject({ id: 's1', name: 'Maths', coefficient: 2.5, openHomework: 1, sortOrder: 1 });
  });

  it('supprime tout ce qui dépend de la matière, et « Annuler » le remet à l’identique', async () => {
    const { db } = await withSubject();
    const count = async (table: string) => (await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
    const before = await Promise.all(['tasks', 'timetable_slots', 'exams', 'grades'].map(count));

    const snapshot = await readSubjectSnapshot(db, 's1');
    expect(snapshot?.tasks.map((t) => t.id)).toEqual(['h1', 'h2', 'h1a']);
    await db.batch([deleteSubjectStatement('s1')]);
    expect(await Promise.all(['subjects', 'tasks', 'timetable_slots', 'exams', 'grades'].map(count))).toEqual([0, 0, 0, 0, 0]);

    await db.batch(restoreSubjectStatements(snapshot!));
    expect(await count('subjects')).toBe(1);
    expect(await Promise.all(['tasks', 'timetable_slots', 'exams', 'grades'].map(count))).toEqual(before);
    const grade = await db.queryOne<{ examId: string; score: number }>("SELECT exam_id, score FROM grades WHERE id = 'g1'");
    expect(grade).toEqual({ examId: 'x1', score: 14.5 });
  });

  it('trouve une matière, et ses devoirs avec elle', async () => {
    const { db } = await withSubject();
    const results = await searchEverything(db, 'maths', TODAY);
    expect(results.find((r) => r.entity === 'subject')).toMatchObject({ id: 's1', context: 'Mme Martin', color: 'blue' });
    const homework = results.find((r) => r.id === 'h1');
    expect(homework).toMatchObject({ entity: 'task', context: 'Maths', direct: false });
    // Par son propre titre aussi, avec sa matière en contexte.
    const direct = await searchEverything(db, 'exercices', TODAY);
    expect(direct.find((r) => r.id === 'h1')).toMatchObject({ context: 'Maths', direct: true });
  });
});
