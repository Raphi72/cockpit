import { nowTimestamp } from '@/core/dates';
import type { Db, Statement } from '@/core/db';
import { reinsertRowStatement } from '@/core/db/rows';
import type { NormalizedSubject, Subject, SubjectListItem } from './model';

const COLUMNS = 's.id, s.name, s.color, s.teacher, s.room, s.coefficient, s.sort_order, s.created_at';

/** Les matières dans l'ordre choisi, avec leurs devoirs pas encore rendus. */
export function listSubjects(db: Db): Promise<SubjectListItem[]> {
  return db.query<SubjectListItem>(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*) FROM tasks t WHERE t.subject_id = s.id AND t.status <> 'done' AND t.parent_id IS NULL) AS open_homework
     FROM subjects s
     ORDER BY s.sort_order, s.name`,
  );
}

export function getSubject(db: Db, id: string): Promise<Subject | undefined> {
  return db.queryOne<Subject>(`SELECT ${COLUMNS} FROM subjects s WHERE s.id = ?`, [id]);
}

/** Nouvelle matière, en fin de liste. */
export function insertSubjectStatement(id: string, subject: NormalizedSubject, now: string): Statement {
  return {
    sql: `INSERT INTO subjects (id, name, color, teacher, room, coefficient, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM subjects), 0) + 1, ?, ?)`,
    params: [id, subject.name, subject.color, subject.teacher, subject.room, subject.coefficient, now, now],
  };
}

export function updateSubjectStatement(id: string, subject: NormalizedSubject, now: string): Statement {
  return {
    sql: `UPDATE subjects SET name = ?, color = ?, teacher = ?, room = ?, coefficient = ?, updated_at = ? WHERE id = ?`,
    params: [subject.name, subject.color, subject.teacher, subject.room, subject.coefficient, now, id],
  };
}

/** Seulement la couleur (celle d'un cours venant de Google, choisie dans la fenêtre du cours). */
export function setSubjectColorStatement(id: string, color: string, now: string): Statement {
  return { sql: 'UPDATE subjects SET color = ?, updated_at = ? WHERE id = ?', params: [color, now, id] };
}

export function deleteSubjectStatement(id: string): Statement {
  return { sql: 'DELETE FROM subjects WHERE id = ?', params: [id] };
}

/**
 * Tout ce que la suppression d'une matière emporte (ON DELETE CASCADE), lu tel quel avant de supprimer :
 * de quoi tout remettre avec « Annuler ». Les devoirs principaux avant leurs sous-tâches.
 */
export type SubjectSnapshot = {
  subject: Record<string, unknown>;
  tasks: Record<string, unknown>[];
  slots: Record<string, unknown>[];
  exams: Record<string, unknown>[];
  grades: Record<string, unknown>[];
  /**
   * Les intitulés de cours de Google reliés à la matière : la suppression en fait des « pas un cours »
   * (ON DELETE SET NULL), pour qu'une matière en trop ne revienne pas à la relecture ; « Annuler » les rend.
   */
  courses: string[];
};

export async function readSubjectSnapshot(db: Db, id: string): Promise<SubjectSnapshot | null> {
  const subject = await db.queryOne<Record<string, unknown>>('SELECT * FROM subjects WHERE id = ?', [id]);
  if (!subject) return null;
  const [tasks, slots, exams, grades, courses] = await Promise.all([
    db.query<Record<string, unknown>>('SELECT * FROM tasks WHERE subject_id = ? ORDER BY parent_id IS NOT NULL, rowid', [id]),
    db.query<Record<string, unknown>>('SELECT * FROM timetable_slots WHERE subject_id = ? ORDER BY rowid', [id]),
    db.query<Record<string, unknown>>('SELECT * FROM exams WHERE subject_id = ? ORDER BY rowid', [id]),
    db.query<Record<string, unknown>>('SELECT * FROM grades WHERE subject_id = ? ORDER BY rowid', [id]),
    db.query<{ course: string }>('SELECT course FROM course_links WHERE subject_id = ? ORDER BY course', [id]),
  ]);
  return { subject, tasks, slots, exams, grades, courses: courses.map((row) => row.course) };
}

/** Annulation : la matière revient, puis ce qui en dépend (les examens avant les notes qui y renvoient). */
export function restoreSubjectStatements(snapshot: SubjectSnapshot): Statement[] {
  return [
    reinsertRowStatement('subjects', snapshot.subject),
    ...snapshot.tasks.map((row) => reinsertRowStatement('tasks', row)),
    ...snapshot.slots.map((row) => reinsertRowStatement('timetable_slots', row)),
    ...snapshot.exams.map((row) => reinsertRowStatement('exams', row)),
    ...snapshot.grades.map((row) => reinsertRowStatement('grades', row)),
    ...(snapshot.courses ?? []).map(
      (course): Statement => ({
        sql: 'UPDATE course_links SET subject_id = ?, updated_at = ? WHERE course = ? AND subject_id IS NULL',
        params: [snapshot.subject.id as string, nowTimestamp(), course],
      }),
    ),
  ];
}
