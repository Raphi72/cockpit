import { sqlDaysModifier } from '@/core/dates';
import type { Db, Statement } from '@/core/db';
import { reinsertRowStatement } from '@/core/db/rows';
import type { Exam, ExamInput } from './model';

/** La note d'un examen : la première saisie qui y renvoie. */
const COLUMNS = `x.id, x.subject_id, s.name AS subject_name, s.color AS subject_color, x.title, x.date, x.starts_at, x.ends_at,
  x.room, x.notes, x.created_at,
  g.id AS grade_id, g.score AS grade_score, g.out_of AS grade_out_of`;

const FROM = `FROM exams x
  JOIN subjects s ON s.id = x.subject_id
  LEFT JOIN grades g ON g.id = (SELECT id FROM grades WHERE exam_id = x.id ORDER BY created_at LIMIT 1)`;

/** Les examens (d'une matière, si `subjectId`), dans l'ordre des dates. */
export function listExams(db: Db, options: { subjectId?: string } = {}): Promise<Exam[]> {
  return options.subjectId
    ? db.query<Exam>(`SELECT ${COLUMNS} ${FROM} WHERE x.subject_id = ? ORDER BY x.date, x.starts_at`, [options.subjectId])
    : db.query<Exam>(`SELECT ${COLUMNS} ${FROM} ORDER BY x.date, x.starts_at`);
}

export function getExam(db: Db, id: string): Promise<Exam | undefined> {
  return db.queryOne<Exam>(`SELECT ${COLUMNS} ${FROM} WHERE x.id = ?`, [id]);
}

const values = (input: ExamInput) => [
  input.subjectId,
  input.title.trim(),
  input.date,
  input.startsAt,
  input.startsAt ? input.endsAt : null,
  input.room.trim() || null,
  input.notes.trim() || null,
];

export function insertExamStatement(id: string, input: ExamInput, now: string): Statement {
  return {
    sql: `INSERT INTO exams (id, subject_id, title, date, starts_at, ends_at, room, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, ...values(input), now, now],
  };
}

export function updateExamStatement(id: string, input: ExamInput, now: string): Statement {
  return {
    sql: `UPDATE exams SET subject_id = ?, title = ?, date = ?, starts_at = ?, ends_at = ?, room = ?, notes = ?, updated_at = ?
          WHERE id = ?`,
    params: [...values(input), now, id],
  };
}

/** Glisser dans le calendrier : l'examen change de jour, ses heures gardées. */
export function shiftExamDateStatement(id: string, days: number, now: string): Statement {
  return {
    sql: 'UPDATE exams SET date = date(date, ?), updated_at = ? WHERE id = ?',
    params: [sqlDaysModifier(days), now, id],
  };
}

export function deleteExamStatement(id: string): Statement {
  return { sql: 'DELETE FROM exams WHERE id = ?', params: [id] };
}

/** Avant de supprimer : l'examen tel quel et ses notes (qui le perdent, ON DELETE SET NULL). */
export async function readExamSnapshot(db: Db, id: string): Promise<{ exam: Record<string, unknown>; gradeIds: string[] } | null> {
  const exam = await db.queryOne<Record<string, unknown>>('SELECT * FROM exams WHERE id = ?', [id]);
  if (!exam) return null;
  const grades = await db.query<{ id: string }>('SELECT id FROM grades WHERE exam_id = ?', [id]);
  return { exam, gradeIds: grades.map((g) => g.id) };
}

/** Annulation : l'examen revient, et ses notes y renvoient de nouveau. */
export function restoreExamStatements(snapshot: { exam: Record<string, unknown>; gradeIds: string[] }): Statement[] {
  const relink: Statement[] = snapshot.gradeIds.length
    ? [
        {
          sql: `UPDATE grades SET exam_id = ? WHERE id IN (${snapshot.gradeIds.map(() => '?').join(', ')})`,
          params: [snapshot.exam.id as string, ...snapshot.gradeIds],
        },
      ]
    : [];
  return [reinsertRowStatement('exams', snapshot.exam), ...relink];
}
