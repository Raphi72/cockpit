import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { isISODate, isTime } from '@/core/dates';
import { relativeDayText } from '@/core/deadline';
import type { PaletteKey } from '@/ui/data/ColorDot';

/** Un contrôle, un partiel, un oral : rattaché à une matière. Sa note, une fois connue, est dans `grades`. */
export type Exam = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: PaletteKey;
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM', facultatifs */
  startsAt: string | null;
  endsAt: string | null;
  room: string | null;
  notes: string | null;
  createdAt: string;
  /** La note obtenue, si elle est saisie (calculé). */
  gradeId: string | null;
  gradeScore: number | null;
  gradeOutOf: number | null;
};

export type ExamInput = {
  subjectId: string | null;
  title: string;
  date: string | null;
  startsAt: string | null;
  endsAt: string | null;
  room: string;
  notes: string;
};

export function validateExam(input: ExamInput): Partial<Record<'subjectId' | 'title' | 'date' | 'time', string>> {
  const errors: Partial<Record<'subjectId' | 'title' | 'date' | 'time', string>> = {};
  if (!input.subjectId) errors.subjectId = 'Choisis la matière.';
  if (input.title.trim() === '') errors.title = 'Donne-lui un titre (« Contrôle chapitre 3 »).';
  if (!input.date || !isISODate(input.date)) errors.date = 'Choisis le jour de l’examen.';
  if (input.startsAt && !isTime(input.startsAt)) errors.time = 'Heure invalide.';
  else if (input.endsAt && !input.startsAt) errors.time = 'Indique aussi l’heure de début.';
  else if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) errors.time = 'La fin doit venir après le début.';
  return errors;
}

export function examToInput(exam: Exam): ExamInput {
  return {
    subjectId: exam.subjectId,
    title: exam.title,
    date: exam.date,
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
    room: exam.room ?? '',
    notes: exam.notes ?? '',
  };
}

/** À venir (aujourd'hui compris), du plus proche au plus lointain ; passés, du plus récent au plus ancien. */
export function splitExams(exams: Exam[], today: string): { upcoming: Exam[]; past: Exam[] } {
  const byMoment = (a: Exam, b: Exam) => a.date.localeCompare(b.date) || (a.startsAt ?? '').localeCompare(b.startsAt ?? '');
  return {
    upcoming: exams.filter((e) => e.date >= today).sort(byMoment),
    past: exams.filter((e) => e.date < today).sort((a, b) => byMoment(b, a)),
  };
}

/** Le prochain examen (aujourd'hui compris). */
export function nextExam(exams: Exam[], today: string): Exam | null {
  return splitExams(exams, today).upcoming[0] ?? null;
}

/** Passés et sans note : à compléter. */
export function examsToGrade(exams: Exam[], today: string): Exam[] {
  return splitExams(exams, today).past.filter((e) => e.gradeId === null);
}

/** « Aujourd'hui », « Demain », « Dans 5 jours »… (comme les deadlines). */
export function examCountdown(exam: Pick<Exam, 'date'>, today: string): string {
  return relativeDayText(exam.date, today);
}

/** « Jeudi 4 déc. · 10:00 – 12:00 · B204 » */
export function examWhen(exam: Pick<Exam, 'date' | 'startsAt' | 'endsAt' | 'room'>): string {
  const day = format(parseISO(exam.date), 'EEEE d MMM', { locale: fr });
  const time = exam.startsAt ? (exam.endsAt ? `${exam.startsAt} – ${exam.endsAt}` : exam.startsAt) : null;
  return [day.charAt(0).toUpperCase() + day.slice(1), time, exam.room].filter(Boolean).join(' · ');
}
