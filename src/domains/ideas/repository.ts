import type { Db, Statement } from '@/core/db';
import type { Idea } from './model';

const COLUMNS = 'id, project_id, title, created_at';

/** Idées d'un projet, dans l'ordre où elles ont été notées. */
export function listProjectIdeas(db: Db, projectId: string): Promise<Idea[]> {
  return db.query<Idea>(`SELECT ${COLUMNS} FROM ideas WHERE project_id = ? ORDER BY created_at, rowid`, [projectId]);
}

export function getIdea(db: Db, id: string): Promise<Idea | undefined> {
  return db.queryOne<Idea>(`SELECT ${COLUMNS} FROM ideas WHERE id = ?`, [id]);
}

export function insertIdeaStatement(idea: { id: string; projectId: string; title: string }, now: string): Statement {
  return {
    sql: 'INSERT INTO ideas (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    params: [idea.id, idea.projectId, idea.title, now, now],
  };
}

/** Réinsère une idée supprimée (ou devenue tâche) à l'identique, à sa place : annulation. */
export function restoreIdeaStatement(idea: Idea, now: string): Statement {
  return {
    sql: 'INSERT INTO ideas (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    params: [idea.id, idea.projectId, idea.title, idea.createdAt, now],
  };
}

export function renameIdeaStatement(id: string, title: string, now: string): Statement {
  return { sql: 'UPDATE ideas SET title = ?, updated_at = ? WHERE id = ?', params: [title, now, id] };
}

export function deleteIdeaStatement(id: string): Statement {
  return { sql: 'DELETE FROM ideas WHERE id = ?', params: [id] };
}
