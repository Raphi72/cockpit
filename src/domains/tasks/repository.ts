import type { Db, SqlValue, Statement } from '@/core/db';
import type { NewTaskInput, TaskItem, TaskPatch } from './model';

const COLUMNS = `
  t.id, t.project_id, p.name AS project_name, pt.color AS project_color,
  t.title, t.notes, t.status, t.priority, t.scheduled_date, t.due_date, t.estimate_min,
  t.sort_order, t.completed_at, t.created_at`;

const FROM = `
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN project_types pt ON pt.id = p.type_id`;

/** Tâches d'un projet clos ou archivé : visibles dans sa fiche, jamais dans les vues globales. */
const IN_OPEN_PROJECT = `(p.id IS NULL OR (p.status NOT IN ('done', 'cancelled') AND p.archived_at IS NULL))`;

/** Toutes les tâches à faire : source unique des vues Aujourd'hui, 7 jours, Retard, Prioritaires, Toutes. */
export function listOpenTasks(db: Db): Promise<TaskItem[]> {
  return db.query<TaskItem>(
    `SELECT ${COLUMNS} ${FROM}
     WHERE t.status <> 'done' AND ${IN_OPEN_PROJECT}
     ORDER BY t.sort_order`,
  );
}

/** Tâches terminées, les plus récentes d'abord (depuis `since` si fourni). */
export function listDoneTasks(db: Db, options: { since?: string; limit?: number } = {}): Promise<TaskItem[]> {
  const params: SqlValue[] = [];
  let where = `t.status = 'done'`;
  if (options.since) {
    where += ' AND t.completed_at >= ?';
    params.push(options.since);
  }
  params.push(options.limit ?? 200);
  return db.query<TaskItem>(
    `SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY t.completed_at DESC LIMIT ?`,
    params,
  );
}

export function listProjectTasks(db: Db, projectId: string): Promise<TaskItem[]> {
  return db.query<TaskItem>(`SELECT ${COLUMNS} ${FROM} WHERE t.project_id = ? ORDER BY t.sort_order`, [projectId]);
}

export function getTask(db: Db, id: string): Promise<TaskItem | undefined> {
  return db.queryOne<TaskItem>(`SELECT ${COLUMNS} ${FROM} WHERE t.id = ?`, [id]);
}

/** Nouvelle tâche, placée en fin de liste de son projet (ou des tâches libres). */
export function insertTaskStatement(id: string, input: NewTaskInput, now: string): Statement {
  return {
    sql: `INSERT INTO tasks
            (id, project_id, title, notes, status, priority, scheduled_date, due_date, estimate_min,
             sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?,
                  COALESCE((SELECT MAX(sort_order) FROM tasks WHERE project_id IS ?), 0) + 1, ?, ?)`,
    params: [
      id,
      input.projectId,
      input.title.trim(),
      input.notes?.trim() || null,
      input.priority,
      input.scheduledDate,
      input.dueDate,
      input.estimateMin,
      input.projectId,
      now,
      now,
    ],
  };
}

/** Réinsère une tâche supprimée à l'identique (annulation). */
export function restoreTaskStatement(task: TaskItem, now: string): Statement {
  return {
    sql: `INSERT INTO tasks
            (id, project_id, title, notes, status, priority, scheduled_date, due_date, estimate_min,
             sort_order, completed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      task.id,
      task.projectId,
      task.title,
      task.notes,
      task.status,
      task.priority,
      task.scheduledDate,
      task.dueDate,
      task.estimateMin,
      task.sortOrder,
      task.completedAt,
      task.createdAt,
      now,
    ],
  };
}

const PATCH_COLUMNS: Record<keyof TaskPatch, string> = {
  title: 'title',
  notes: 'notes',
  projectId: 'project_id',
  status: 'status',
  priority: 'priority',
  scheduledDate: 'scheduled_date',
  dueDate: 'due_date',
  estimateMin: 'estimate_min',
};

export function updateTaskStatement(id: string, patch: TaskPatch, now: string): Statement {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const key of Object.keys(patch) as (keyof TaskPatch)[]) {
    sets.push(`${PATCH_COLUMNS[key]} = ?`);
    params.push(patch[key] ?? null);
  }
  if (patch.status !== undefined) {
    sets.push('completed_at = ?');
    params.push(patch.status === 'done' ? now : null);
  }
  sets.push('updated_at = ?');
  params.push(now);
  return { sql: `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params: [...params, id] };
}

export function sortOrderStatements(updates: { id: string; sortOrder: number }[], now: string): Statement[] {
  return updates.map((u) => ({
    sql: 'UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?',
    params: [u.sortOrder, now, u.id],
  }));
}

export function deleteTaskStatement(id: string): Statement {
  return { sql: 'DELETE FROM tasks WHERE id = ?', params: [id] };
}
