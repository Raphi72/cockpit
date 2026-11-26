import { isISODate } from '@/core/dates';
import type { AppColor } from '@/ui/data/ColorDot';
import { semesters as semestersOf, type SchoolPeriod } from '../periods/model';
import { formatDecimal, parseDecimal } from '../subjects/model';

/**
 * Notes et moyennes. Une note compte pour le semestre qui contient sa date. Toutes les moyennes sont
 * calculées ici, jamais stockées :
 * - moyenne d'une matière : moyenne des notes ramenées sur 20, pondérée par leur coefficient ;
 * - moyenne générale : moyenne des matières notées, pondérée par le coefficient de chaque matière ;
 * - moyenne de l'année d'une matière : moyenne de ses moyennes de semestre (les semestres où elle a
 *   des notes) ; moyenne générale de l'année : celle des matières, pondérée comme au semestre.
 */
export type Grade = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: AppColor;
  subjectCoefficient: number;
  examId: string | null;
  examTitle: string | null;
  title: string | null;
  score: number;
  outOf: number;
  coefficient: number;
  /** 'YYYY-MM-DD' : elle range la note dans un semestre. */
  date: string;
  createdAt: string;
};

export type GradeInput = {
  subjectId: string | null;
  examId: string | null;
  title: string;
  /** Saisis en texte : « 14,5 », « 20 », « 1 ». */
  score: string;
  outOf: string;
  coefficient: string;
  date: string | null;
};

export type NormalizedGrade = {
  subjectId: string;
  examId: string | null;
  title: string | null;
  score: number;
  outOf: number;
  coefficient: number;
  date: string;
};

export function validateGrade(input: GradeInput): Partial<Record<'subjectId' | 'score' | 'coefficient' | 'date', string>> {
  const errors: Partial<Record<'subjectId' | 'score' | 'coefficient' | 'date', string>> = {};
  if (!input.subjectId) errors.subjectId = 'Choisis la matière.';
  const score = parseDecimal(input.score);
  const outOf = parseDecimal(input.outOf);
  if (score === null) errors.score = 'Écris la note (14 ou 14,5).';
  else if (outOf === null || outOf <= 0) errors.score = 'Le barème doit être un nombre plus grand que 0.';
  else if (score > outOf) errors.score = `La note dépasse le barème (sur ${formatDecimal(outOf)}).`;
  const coefficient = parseDecimal(input.coefficient);
  if (coefficient === null || coefficient <= 0) errors.coefficient = 'Un nombre plus grand que 0.';
  if (!input.date || !isISODate(input.date)) errors.date = 'Choisis la date de la note.';
  return errors;
}

export function normalizeGrade(input: GradeInput): NormalizedGrade {
  return {
    subjectId: input.subjectId ?? '',
    examId: input.examId,
    title: input.title.trim() || null,
    score: parseDecimal(input.score) ?? 0,
    outOf: parseDecimal(input.outOf) ?? 20,
    coefficient: parseDecimal(input.coefficient) ?? 1,
    date: input.date ?? '',
  };
}

export function gradeToInput(grade: Grade): GradeInput {
  return {
    subjectId: grade.subjectId,
    examId: grade.examId,
    title: grade.title ?? '',
    score: formatDecimal(grade.score),
    outOf: formatDecimal(grade.outOf),
    coefficient: formatDecimal(grade.coefficient),
    date: grade.date,
  };
}

/** « DS 2 », sinon le titre de l'examen, sinon « Note ». */
export function gradeTitle(grade: Pick<Grade, 'title' | 'examTitle'>): string {
  return grade.title ?? grade.examTitle ?? 'Note';
}

/** « 14,5/20 », ou « 14,5 » quand le barème est sur 20 et que `short`. */
export function gradeLabel(grade: Pick<Grade, 'score' | 'outOf'>, short = false): string {
  if (short && grade.outOf === 20) return formatDecimal(grade.score);
  return `${formatDecimal(grade.score)}/${formatDecimal(grade.outOf)}`;
}

/** Une note ramenée sur 20. */
export function on20(grade: Pick<Grade, 'score' | 'outOf'>): number {
  return (grade.score / grade.outOf) * 20;
}

/** Moyenne pondérée ; `null` sans aucune valeur. */
function weightedMean(values: { value: number; weight: number }[]): number | null {
  const weight = values.reduce((sum, v) => sum + v.weight, 0);
  if (values.length === 0 || weight === 0) return null;
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / weight;
}

/** Moyenne d'une matière sur ces notes, sur 20 ; `null` sans note. */
export function subjectAverage(grades: Pick<Grade, 'score' | 'outOf' | 'coefficient'>[]): number | null {
  return weightedMean(grades.map((g) => ({ value: on20(g), weight: g.coefficient })));
}

/** « 13,75 », ou « – » sans moyenne. */
export function formatAverage(average: number | null): string {
  return average === null ? '–' : formatDecimal(average);
}

export type SubjectRef = { id: string; name: string; color: AppColor; coefficient: number };

export type SubjectLine = { subject: SubjectRef; grades: Grade[]; average: number | null };

export type Report = { lines: SubjectLine[]; general: number | null };

/** Moyenne générale : celle des matières notées, pondérée par leur coefficient. */
function generalOf(lines: { subject: SubjectRef; average: number | null }[]): number | null {
  return weightedMean(lines.flatMap((l) => (l.average === null ? [] : [{ value: l.average, weight: l.subject.coefficient }])));
}

const inPeriod = (period: Pick<SchoolPeriod, 'startsOn' | 'endsOn'> | null) => (grade: Grade) =>
  period === null || (grade.date >= period.startsOn && grade.date <= period.endsOn);

/**
 * Bulletin d'une période (un semestre, ou toutes les notes avec `null`) : chaque matière avec ses notes
 * (les plus récentes d'abord) et sa moyenne, puis la moyenne générale.
 */
export function periodReport(grades: Grade[], subjects: SubjectRef[], period: Pick<SchoolPeriod, 'startsOn' | 'endsOn'> | null): Report {
  const kept = grades.filter(inPeriod(period));
  const lines = subjects.map((subject) => {
    const mine = kept
      .filter((g) => g.subjectId === subject.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    return { subject, grades: mine, average: subjectAverage(mine) };
  });
  return { lines, general: generalOf(lines) };
}

export type YearLine = { subject: SubjectRef; bySemester: (number | null)[]; average: number | null };

export type YearReport = { semesters: SchoolPeriod[]; lines: YearLine[]; general: number | null; generalBySemester: (number | null)[] };

/**
 * L'année : pour chaque matière, sa moyenne de chaque semestre et celle de l'année (moyenne de ses
 * moyennes de semestre). Sans semestre saisi, l'année est l'ensemble des notes.
 */
export function yearReport(grades: Grade[], subjects: SubjectRef[], periods: SchoolPeriod[]): YearReport {
  const list = semestersOf(periods);
  if (list.length === 0) {
    const all = periodReport(grades, subjects, null);
    return {
      semesters: [],
      lines: all.lines.map((l) => ({ subject: l.subject, bySemester: [], average: l.average })),
      general: all.general,
      generalBySemester: [],
    };
  }
  const reports = list.map((semester) => periodReport(grades, subjects, semester));
  const lines = subjects.map((subject, index) => {
    const bySemester = reports.map((report) => report.lines[index]?.average ?? null);
    const known = bySemester.filter((v): v is number => v !== null);
    return { subject, bySemester, average: known.length ? known.reduce((a, b) => a + b, 0) / known.length : null };
  });
  return { semesters: list, lines, general: generalOf(lines), generalBySemester: reports.map((r) => r.general) };
}
