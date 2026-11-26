import { describe, expect, it } from 'vitest';
import {
  formatAverage,
  gradeLabel,
  gradeTitle,
  normalizeGrade,
  on20,
  periodReport,
  subjectAverage,
  validateGrade,
  yearReport,
  type Grade,
  type GradeInput,
  type SubjectRef,
} from '@/domains/school/grades/model';
import { insertGradeStatement, listGrades } from '@/domains/school/grades/repository';
import { insertExamStatement } from '@/domains/school/exams/repository';
import type { SchoolPeriod } from '@/domains/school/periods/model';
import { normalizeSubject } from '@/domains/school/subjects/model';
import { insertSubjectStatement } from '@/domains/school/subjects/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';

const maths: SubjectRef = { id: 'maths', name: 'Maths', color: 'blue', coefficient: 3 };
const anglais: SubjectRef = { id: 'angl', name: 'Anglais', color: 'pink', coefficient: 1 };
const histoire: SubjectRef = { id: 'hist', name: 'Histoire', color: 'amber', coefficient: 2 };

let n = 0;
const grade = (subject: SubjectRef, score: number, outOf: number, coefficient: number, date: string): Grade => ({
  id: `g${++n}`,
  subjectId: subject.id,
  subjectName: subject.name,
  subjectColor: subject.color,
  subjectCoefficient: subject.coefficient,
  examId: null,
  examTitle: null,
  title: null,
  score,
  outOf,
  coefficient,
  date,
  createdAt: NOW,
});

const periods: SchoolPeriod[] = [
  { id: 's1', kind: 'semester', name: 'Semestre 1', startsOn: '2026-09-01', endsOn: '2027-01-31' },
  { id: 's2', kind: 'semester', name: 'Semestre 2', startsOn: '2027-02-01', endsOn: '2027-06-30' },
];

const grades = [
  // Maths, semestre 1 : 12/20 (coef 1) et 9/10 = 18/20 (coef 2) → (12 + 36) / 3 = 16.
  grade(maths, 12, 20, 1, '2026-10-02'),
  grade(maths, 9, 10, 2, '2026-11-15'),
  // Anglais, semestre 1 : 10/20.
  grade(anglais, 10, 20, 1, '2026-10-20'),
  // Maths, semestre 2 : 11/20.
  grade(maths, 11, 20, 1, '2027-03-01'),
];

describe('notes : règles', () => {
  const input: GradeInput = { subjectId: 'maths', examId: null, title: '', score: '14,5', outOf: '20', coefficient: '1', date: '2026-11-26' };

  it('valide une note et la lit à la française', () => {
    expect(validateGrade(input)).toEqual({});
    expect(validateGrade({ ...input, score: '21' }).score).toBe('La note dépasse le barème (sur 20).');
    expect(validateGrade({ ...input, score: 'abc' }).score).toBeDefined();
    expect(validateGrade({ ...input, outOf: '0' }).score).toBeDefined();
    expect(validateGrade({ ...input, coefficient: '0' }).coefficient).toBeDefined();
    expect(validateGrade({ ...input, subjectId: null, date: null })).toMatchObject({ subjectId: expect.any(String), date: expect.any(String) });
    expect(normalizeGrade({ ...input, title: '  DS 2 ' })).toEqual({
      subjectId: 'maths',
      examId: null,
      title: 'DS 2',
      score: 14.5,
      outOf: 20,
      coefficient: 1,
      date: '2026-11-26',
    });
  });

  it('ramène sur 20 et affiche', () => {
    expect(on20({ score: 9, outOf: 10 })).toBe(18);
    expect(gradeLabel({ score: 14.5, outOf: 20 })).toBe('14,5/20');
    expect(gradeLabel({ score: 14.5, outOf: 20 }, true)).toBe('14,5');
    expect(gradeLabel({ score: 9, outOf: 10 }, true)).toBe('9/10');
    expect(gradeTitle({ title: null, examTitle: 'Partiel' })).toBe('Partiel');
    expect(gradeTitle({ title: null, examTitle: null })).toBe('Note');
    expect(formatAverage(13.756)).toBe('13,76');
    expect(formatAverage(null)).toBe('–');
  });

  it('calcule la moyenne d’une matière, pondérée par les coefficients des notes', () => {
    expect(subjectAverage(grades.slice(0, 2))).toBe(16);
    expect(subjectAverage([])).toBeNull();
  });

  it('fait le bulletin d’un semestre : moyenne générale pondérée par matière', () => {
    const report = periodReport(grades, [maths, anglais, histoire], periods[0]!);
    expect(report.lines.map((l) => [l.subject.id, l.average, l.grades.length])).toEqual([
      ['maths', 16, 2],
      ['angl', 10, 1],
      ['hist', null, 0],
    ]);
    // (16 × 3 + 10 × 1) / 4 = 14,5 ; l'histoire, sans note, ne compte pas.
    expect(report.general).toBe(14.5);
    // Les plus récentes d'abord.
    expect(report.lines[0]?.grades.map((g) => g.date)).toEqual(['2026-11-15', '2026-10-02']);
  });

  it('fait l’année : la moyenne des semestres de chaque matière', () => {
    const year = yearReport(grades, [maths, anglais, histoire], periods);
    expect(year.lines.map((l) => [l.subject.id, l.bySemester, l.average])).toEqual([
      ['maths', [16, 11], 13.5],
      ['angl', [10, null], 10],
      ['hist', [null, null], null],
    ]);
    // (13,5 × 3 + 10 × 1) / 4 = 12,625
    expect(year.general).toBe(12.625);
    expect(year.generalBySemester).toEqual([14.5, 11]);
  });

  it('sans semestre, l’année est l’ensemble des notes', () => {
    const year = yearReport(grades, [maths, anglais], []);
    expect(year.semesters).toEqual([]);
    expect(year.lines.map((l) => l.average)).toEqual([subjectAverage(grades.filter((g) => g.subjectId === 'maths')), 10]);
  });
});

describe('notes : base', () => {
  it('lit les notes avec leur matière et leur examen', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertSubjectStatement('maths', normalizeSubject({ name: 'Maths', color: 'blue', teacher: '', room: '', coefficient: '3' }), NOW),
      insertExamStatement('x1', { subjectId: 'maths', title: 'Partiel', date: '2026-11-20', startsAt: null, endsAt: null, room: '', notes: '' }, NOW),
      insertGradeStatement('g1', normalizeGrade({ subjectId: 'maths', examId: 'x1', title: '', score: '15', outOf: '20', coefficient: '2', date: '2026-11-20' }), NOW),
    ]);
    const [row] = await listGrades(db);
    expect(row).toMatchObject({ subjectName: 'Maths', subjectCoefficient: 3, examTitle: 'Partiel', title: null, score: 15, coefficient: 2 });
    expect(gradeTitle(row!)).toBe('Partiel');
  });
});
