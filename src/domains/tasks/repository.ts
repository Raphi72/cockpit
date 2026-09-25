import type { Db, SqlValue, Statement } from '@/core/db';
import type { NewTaskInput, TaskItem, TaskPatch } from './model';

const COLUMNS = `
  t.id, t.project_id, p.name AS project_name, pt.color AS project_color,
  t.title, t.notes, t.status, t.priority, t.scheduled_date, t.due_date, t.estimate_min,
  t.sort_order, t.completed_at, t.created_at, t.parent_id, par.title AS parent_title,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id) AS subtasks_total,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = t.id AND c.status = 'done') AS subtasks_done`;

const FROM = `
  FROM tasks t
  LEFT JOIN tasks par ON par.id = t.parent_id
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

/** Tâches terminées, les plus récentes d'abord (depuis `since` et avant `until` si fournis). */
export function listDoneTasks(
  db: Db,
  options: { since?: string; until?: string; limit?: number } = {},
): Promise<TaskItem[]> {
  const params: SqlValue[] = [];
  let where = `t.status = 'done'`;
  if (options.since) {
    where += ' AND t.completed_at >= ?';
    params.push(options.since);
  }
  if (options.until) {
    where += ' AND t.completed_at < ?';
    params.push(options.until);
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

/** Sous-tâches d'une tâche, dans l'ordre manuel. */
export function listSubtasks(db: Db, parentId: string): Promise<TaskItem[]> {
  return db.query<TaskItem>(`SELECT ${COLUMNS} ${FROM} WHERE t.parent_id = ? ORDER BY t.sort_order`, [parentId]);
}

/**
 * Tâches qui peuvent accueillir `task` comme sous-tâche : du premier niveau, ouvertes, dans le même
 * projet (ou libres, pour une tâche libre), sauf elle-même. Voir aussi canBeParentOf.
 */
export function listParentCandidates(db: Db, task: Pick<TaskItem, 'id' | 'projectId'>): Promise<TaskItem[]> {
  return db.query<TaskItem>(
    `SELECT ${COLUMNS} ${FROM}
     WHERE t.parent_id IS NULL AND t.status <> 'done' AND t.project_id IS ? AND t.id <> ?
     ORDER BY t.sort_order`,
    [task.projectId, task.id],
  );
}

/**
 * État avant une action groupée : les tâches choisies, leurs sous-tâches et leurs parentes
 * (qu'une action peut terminer ou rouvrir en cascade). De quoi tout remettre avec « Annuler ».
 */
export function listTasksAround(db: Db, ids: string[]): Promise<TaskItem[]> {
  const marks = ids.map(() => '?').join(', ');
  return db.query<TaskItem>(
    `SELECT ${COLUMNS} ${FROM}
     WHERE t.id IN (${marks}) OR t.parent_id IN (${marks})
        OR t.id IN (SELECT parent_id FROM tasks WHERE id IN (${marks}))`,
    [...ids, ...ids, ...ids],
  );
}

export function getTask(db: Db, id: string): Promise<TaskItem | undefined> {
  return db.queryOne<TaskItem>(`SELECT ${COLUMNS} ${FROM} WHERE t.id = ?`, [id]);
}

/**
 * Nouvelle tâche, placée en fin de liste de son projet (ou des tâches libres). Une sous-tâche se
 * place après ses sœurs et prend le projet de sa parente, quel que soit `input.projectId`.
 */
export function insertTaskStatement(id: string, input: NewTaskInput, now: string): Statement {
  const parentId = input.parentId ?? null;
  const project = parentId ? '(SELECT project_id FROM tasks WHERE id = ?)' : '?';
  const order = parentId
    ? 'COALESCE((SELECT MAX(sort_order) FROM tasks WHERE parent_id = ?), 0) + 1'
    : 'COALESCE((SELECT MAX(sort_order) FROM tasks WHERE project_id IS ?), 0) + 1';
  return {
    sql: `INSERT INTO tasks
            (id, project_id, parent_id, title, notes, status, priority, scheduled_date, due_date, estimate_min,
             sort_order, created_at, updated_at)
          VALUES (?, ${project}, ?, ?, ?, 'todo', ?, ?, ?, ?, ${order}, ?, ?)`,
    params: [
      id,
      parentId ?? input.projectId,
      parentId,
      input.title.trim(),
      input.notes?.trim() || null,
      input.priority,
      input.scheduledDate,
      input.dueDate,
      input.estimateMin,
      parentId ?? input.projectId,
      now,
      now,
    ],
  };
}

/** Réinsère une tâche supprimée à l'identique (annulation). */
export function restoreTaskStatement(task: TaskItem, now: string): Statement {
  return {
    sql: `INSERT INTO tasks
            (id, project_id, parent_id, title, notes, status, priority, scheduled_date, due_date, estimate_min,
             sort_order, completed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      task.id,
      task.projectId,
      task.parentId,
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
  parentId: 'parent_id',
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

/**
 * Une modification et ce qu'elle entraîne pour la parente et les sous-tâches, dans le même lot.
 * Tout est écrit en SQL à partir des identifiants : rien ne dépend de ce qu'affiche l'écran.
 * - Terminer une tâche termine ses sous-tâches ; terminer la dernière sous-tâche ouverte termine la parente.
 * - Rouvrir une sous-tâche rouvre sa parente.
 * - Changer de projet : les sous-tâches suivent ; une sous-tâche qui quitte le projet de sa parente s'en détache.
 * - Devenir sous-tâche : on rejoint le projet de sa parente (rouverte si besoin).
 */
export function updateTaskStatements(id: string, patch: TaskPatch, now: string): Statement[] {
  const statements = [updateTaskStatement(id, patch, now)];
  const parentOf = '(SELECT parent_id FROM tasks WHERE id = ?)';
  const reopenParentIfOpenChild = {
    sql: `UPDATE tasks SET status = 'todo', completed_at = NULL, updated_at = ?
          WHERE id = ${parentOf} AND status = 'done'
            AND EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = tasks.id AND c.status <> 'done')`,
    params: [now, id],
  };

  if (patch.status === 'done') {
    statements.push(
      {
        sql: `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE parent_id = ? AND status <> 'done'`,
        params: [now, now, id],
      },
      {
        sql: `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ?
              WHERE id = ${parentOf} AND status <> 'done'
                AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = tasks.id AND c.status <> 'done')`,
        params: [now, now, id],
      },
    );
  } else if (patch.status !== undefined) {
    statements.push(reopenParentIfOpenChild);
  }

  if (patch.projectId !== undefined) {
    statements.push(
      { sql: 'UPDATE tasks SET project_id = ?, updated_at = ? WHERE parent_id = ?', params: [patch.projectId, now, id] },
      {
        sql: `UPDATE tasks SET parent_id = NULL
              WHERE id = ? AND parent_id IS NOT NULL
                AND (SELECT p.project_id FROM tasks p WHERE p.id = tasks.parent_id) IS NOT project_id`,
        params: [id],
      },
    );
  }

  if (patch.parentId) {
    statements.push(
      {
        // Elle rejoint le projet de sa parente, après ses nouvelles sœurs.
        sql: `UPDATE tasks SET project_id = (SELECT p.project_id FROM tasks p WHERE p.id = ?),
                sort_order = COALESCE((SELECT MAX(s.sort_order) FROM tasks s WHERE s.parent_id = ? AND s.id <> ?), 0) + 1
              WHERE id = ?`,
        params: [patch.parentId, patch.parentId, id, id],
      },
      reopenParentIfOpenChild,
    );
  } else if (patch.parentId === null) {
    // Sortie de sa parente : en fin de liste de son projet.
    statements.push({
      sql: `UPDATE tasks SET sort_order =
              COALESCE((SELECT MAX(s.sort_order) FROM tasks s WHERE s.project_id IS tasks.project_id AND s.id <> tasks.id), 0) + 1
            WHERE id = ?`,
      params: [id],
    });
  }
  return statements;
}

/** Remet les champs qu'une action groupée peut changer, sans cascade : annulation. */
export function restoreTaskFieldsStatement(task: TaskItem, now: string): Statement {
  return {
    sql: `UPDATE tasks SET status = ?, completed_at = ?, priority = ?, scheduled_date = ?, due_date = ?, updated_at = ?
          WHERE id = ?`,
    params: [task.status, task.completedAt, task.priority, task.scheduledDate, task.dueDate, now, task.id],
  };
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
