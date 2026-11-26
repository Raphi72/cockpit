import type { Db, Statement } from '@/core/db';
import type { Grade, NormalizedGrade } from './model';

/** Toutes les notes, avec leur matière et leur examen, dans l'ordre des dates. */
export function listGrades(db: Db): Promise<Grade[]> {
  return db.query<Grade>(
    `SELECT g.id, g.subject_id, s.name AS subject_name, s.color AS subject_color, s.coefficient AS subject_coefficient,
            g.exam_id, x.title AS exam_title, g.title, g.score, g.out_of, g.coefficient, g.date, g.created_at
     FROM grades g
     JOIN subjects s ON s.id = g.subject_id
     LEFT JOIN exams x ON x.id = g.exam_id
     ORDER BY g.date, g.created_at`,
  );
}

const values = (grade: NormalizedGrade) => [
  grade.subjectId,
  grade.examId,
  grade.title,
  grade.score,
  grade.outOf,
  grade.coefficient,
  grade.date,
];

export function insertGradeStatement(id: string, grade: NormalizedGrade, now: string): Statement {
  return {
    sql: `INSERT INTO grades (id, subject_id, exam_id, title, score, out_of, coefficient, date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, ...values(grade), now, now],
  };
}

export function updateGradeStatement(id: string, grade: NormalizedGrade, now: string): Statement {
  return {
    sql: `UPDATE grades SET subject_id = ?, exam_id = ?, title = ?, score = ?, out_of = ?, coefficient = ?, date = ?, updated_at = ?
          WHERE id = ?`,
    params: [...values(grade), now, id],
  };
}

export function deleteGradeStatement(id: string): Statement {
  return { sql: 'DELETE FROM grades WHERE id = ?', params: [id] };
}

/** La note telle qu'elle est en base, pour la remettre avec « Annuler ». */
export function getGradeRow(db: Db, id: string): Promise<Record<string, unknown> | undefined> {
  return db.queryOne<Record<string, unknown>>('SELECT * FROM grades WHERE id = ?', [id]);
}
