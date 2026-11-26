import { describe, expect, it } from 'vitest';
import { sql } from '@/core/db/client';
import { buildShiftBatch } from '@/domains/agenda/service';
import { listAgenda } from '@/domains/agenda/repository';
import { examCountdown, examWhen, examsToGrade, nextExam, splitExams, validateExam, type ExamInput } from '@/domains/school/exams/model';
import {
  deleteExamStatement,
  getExam,
  insertExamStatement,
  listExams,
  readExamSnapshot,
  restoreExamStatements,
} from '@/domains/school/exams/repository';
import { normalizeSubject } from '@/domains/school/subjects/model';
import { insertSubjectStatement } from '@/domains/school/subjects/repository';
import { searchEverything } from '@/domains/search/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
const TODAY = '2026-11-26';

const exam = (subjectId: string, title: string, date: string, startsAt: string | null = null, endsAt: string | null = null): ExamInput => ({
  subjectId,
  title,
  date,
  startsAt,
  endsAt,
  room: '',
  notes: '',
});

async function setup() {
  const { db } = createTestDb();
  await db.batch([
    insertSubjectStatement('maths', normalizeSubject({ name: 'Maths', color: 'blue', teacher: '', room: '', coefficient: '1' }), NOW),
    insertExamStatement('x1', exam('maths', 'Contrôle chapitre 3', '2026-12-03', '10:00', '12:00'), NOW),
    insertExamStatement('x2', exam('maths', 'Interro surprise', '2026-11-20'), NOW),
    insertExamStatement('x3', exam('maths', 'Oral', '2026-11-10'), NOW),
    sql`INSERT INTO grades (id, subject_id, exam_id, score, out_of, coefficient, date, created_at, updated_at)
        VALUES ('g1', 'maths', 'x3', 15, 20, 1, '2026-11-10', ${NOW}, ${NOW})`,
  ]);
  return db;
}

describe('examens : règles', () => {
  it('demande une matière, un titre, un jour et des heures cohérentes', () => {
    expect(validateExam(exam('maths', 'Partiel', '2026-12-01'))).toEqual({});
    expect(Object.keys(validateExam({ ...exam('', '', ''), subjectId: null, date: null })).sort()).toEqual(['date', 'subjectId', 'title']);
    expect(validateExam(exam('maths', 'P', '2026-12-01', null, '12:00')).time).toBe('Indique aussi l’heure de début.');
    expect(validateExam(exam('maths', 'P', '2026-12-01', '12:00', '10:00')).time).toBe('La fin doit venir après le début.');
  });

  it('range à venir et passés, et dit ce qui reste à noter', async () => {
    const db = await setup();
    const exams = await listExams(db);
    const { upcoming, past } = splitExams(exams, TODAY);
    expect(upcoming.map((e) => e.id)).toEqual(['x1']);
    expect(past.map((e) => e.id)).toEqual(['x2', 'x3']);
    expect(nextExam(exams, TODAY)?.id).toBe('x1');
    expect(examsToGrade(exams, TODAY).map((e) => e.id)).toEqual(['x2']);
    expect(exams.find((e) => e.id === 'x3')).toMatchObject({ gradeId: 'g1', gradeScore: 15, gradeOutOf: 20 });
    expect(examCountdown(upcoming[0]!, TODAY)).toBe('Dans 7 jours');
    expect(examWhen(upcoming[0]!)).toBe('Jeudi 3 déc. · 10:00 – 12:00');
  });
});

describe('examens : base', () => {
  it('sont dans l’agenda, à leur heure ou sur la journée, et se glissent d’un jour à l’autre', async () => {
    const db = await setup();
    const items = await listAgenda(db, '2026-11-01', '2026-12-31');
    const timed = items.find((i) => i.id === 'x1')!;
    expect(timed).toMatchObject({ source: 'exam', kind: 'exam', start: '2026-12-03T10:00', end: '2026-12-03T12:00', allDay: false, detail: 'Maths', subjectId: 'maths' });
    expect(items.find((i) => i.id === 'x2')).toMatchObject({ start: '2026-11-20', end: null, allDay: true });

    const shift = buildShiftBatch(timed, 2, NOW);
    await db.batch(shift.statements);
    expect((await getExam(db, 'x1'))?.date).toBe('2026-12-05');
    await db.batch(shift.undo);
    expect((await getExam(db, 'x1'))?.date).toBe('2026-12-03');
  });

  it('supprimé, garde sa note ; « Annuler » le remet avec le lien', async () => {
    const db = await setup();
    const snapshot = await readExamSnapshot(db, 'x3');
    await db.batch([deleteExamStatement('x3')]);
    expect(await db.queryOne('SELECT exam_id FROM grades WHERE id = ?', ['g1'])).toEqual({ examId: null });
    await db.batch(restoreExamStatements(snapshot!));
    expect(await getExam(db, 'x3')).toMatchObject({ title: 'Oral', gradeId: 'g1' });
  });

  it('se retrouvent dans la recherche, et avec leur matière', async () => {
    const db = await setup();
    const direct = await searchEverything(db, 'controle', TODAY);
    expect(direct.find((r) => r.id === 'x1')).toMatchObject({ entity: 'exam', context: 'Maths', closed: false });
    const bySubject = await searchEverything(db, 'maths', TODAY);
    expect(bySubject.filter((r) => r.entity === 'exam').map((r) => r.id).sort()).toEqual(['x1', 'x2', 'x3']);
  });
});
