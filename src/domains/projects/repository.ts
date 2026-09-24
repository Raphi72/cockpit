import type { Db, SqlValue, Statement } from '@/core/db';
import type {
  ProjectDetail,
  ProjectListItem,
  ProjectPatch,
  ProjectStatus,
  ProjectType,
  ProjectTypeWithUsage,
} from './model';

// ─── Types de projet ────────────────────────────────────────────────────────

export function listProjectTypes(db: Db): Promise<ProjectType[]> {
  return db.query<ProjectType>('SELECT id, name, color, sort_order FROM project_types ORDER BY sort_order');
}

export function listProjectTypesWithUsage(db: Db): Promise<ProjectTypeWithUsage[]> {
  return db.query<ProjectTypeWithUsage>(
    `SELECT t.id, t.name, t.color, t.sort_order,
            (SELECT COUNT(*) FROM projects p WHERE p.type_id = t.id) AS project_count
     FROM project_types t
     ORDER BY t.sort_order`,
  );
}

export function insertProjectType(db: Db, type: ProjectType) {
  return db.execute('INSERT INTO project_types (id, name, color, sort_order) VALUES (?, ?, ?, ?)', [
    type.id,
    type.name,
    type.color,
    type.sortOrder,
  ]);
}

export function updateProjectType(db: Db, id: string, patch: Partial<Pick<ProjectType, 'name' | 'color'>>) {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(patch.name);
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    params.push(patch.color);
  }
  return db.execute(`UPDATE project_types SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

export function deleteProjectType(db: Db, id: string) {
  return db.execute('DELETE FROM project_types WHERE id = ?', [id]);
}

// ─── Projets ────────────────────────────────────────────────────────────────

const LIST_COLUMNS = `
  p.id, p.name, p.status, p.priority, p.start_date, p.deadline, p.budget_cents,
  p.type_id, t.name AS type_name, t.color AS type_color,
  p.client_id, c.name AS client_name,
  COALESCE(pp.tasks_total, 0) AS tasks_total, COALESCE(pp.tasks_done, 0) AS tasks_done,
  COALESCE(pm.received_cents, 0) AS received_cents, COALESCE(pm.scheduled_cents, 0) AS scheduled_cents`;

const LIST_FROM = `
  FROM projects p
  JOIN project_types t ON t.id = p.type_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN project_progress pp ON pp.project_id = p.id
  LEFT JOIN project_money pm ON pm.project_id = p.id`;

export type ProjectFilter = {
  statuses: ProjectStatus[];
  typeId?: string;
  clientId?: string;
};

/** Projets triés par deadline (les projets sans deadline en dernier). */
export function listProjects(db: Db, filter: ProjectFilter): Promise<ProjectListItem[]> {
  const where = [`p.archived_at IS NULL`, `p.status IN (${filter.statuses.map(() => '?').join(', ')})`];
  const params: SqlValue[] = [...filter.statuses];
  if (filter.typeId) {
    where.push('p.type_id = ?');
    params.push(filter.typeId);
  }
  if (filter.clientId) {
    where.push('p.client_id = ?');
    params.push(filter.clientId);
  }

  return db.query<ProjectListItem>(
    `SELECT ${LIST_COLUMNS} ${LIST_FROM}
     WHERE ${where.join(' AND ')}
     ORDER BY p.deadline IS NULL, p.deadline, p.created_at DESC`,
    params,
  );
}

export function getProject(db: Db, id: string): Promise<ProjectDetail | undefined> {
  return db.queryOne<ProjectDetail>(
    `SELECT ${LIST_COLUMNS}, p.description, p.notes, p.created_at, p.completed_at
     ${LIST_FROM}
     WHERE p.id = ?`,
    [id],
  );
}

export type NewProjectRow = {
  id: string;
  name: string;
  description: string | null;
  clientId: string | null;
  typeId: string;
  status: ProjectStatus;
  priority: number;
  startDate: string | null;
  deadline: string | null;
  budgetCents: number | null;
};

export function insertProjectStatement(project: NewProjectRow, now: string): Statement {
  return {
    sql: `INSERT INTO projects
            (id, name, description, client_id, type_id, status, priority, start_date, deadline,
             budget_cents, completed_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      project.id,
      project.name,
      project.description,
      project.clientId,
      project.typeId,
      project.status,
      project.priority,
      project.startDate,
      project.deadline,
      project.budgetCents,
      project.status === 'done' ? now : null,
      now,
      now,
    ],
  };
}

const PATCH_COLUMNS: Record<keyof ProjectPatch, string> = {
  name: 'name',
  description: 'description',
  notes: 'notes',
  clientId: 'client_id',
  typeId: 'type_id',
  status: 'status',
  priority: 'priority',
  startDate: 'start_date',
  deadline: 'deadline',
  budgetCents: 'budget_cents',
};

export function updateProjectStatement(id: string, patch: ProjectPatch, now: string): Statement {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  for (const key of Object.keys(patch) as (keyof ProjectPatch)[]) {
    sets.push(`${PATCH_COLUMNS[key]} = ?`);
    params.push(patch[key] ?? null);
  }
  if (patch.status !== undefined) {
    sets.push('completed_at = ?');
    params.push(patch.status === 'done' ? now : null);
  }
  sets.push('updated_at = ?');
  params.push(now);
  return { sql: `UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params: [...params, id] };
}

/** Nombre d'encaissements déjà reçus : un projet qui en a ne peut pas être supprimé. */
export async function countReceivedPayments(db: Db, projectId: string): Promise<number> {
  const row = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM payments WHERE project_id = ? AND status = 'received'",
    [projectId],
  );
  return row?.count ?? 0;
}

// ─── Suppression et annulation ──────────────────────────────────────────────

/** Ligne brute d'un projet, pour le réinsérer à l'identique. */
export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  clientId: string | null;
  typeId: string;
  status: ProjectStatus;
  priority: number;
  startDate: string | null;
  deadline: string | null;
  budgetCents: number | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export function getProjectRow(db: Db, id: string): Promise<ProjectRow | undefined> {
  return db.queryOne<ProjectRow>(
    `SELECT id, name, description, notes, client_id, type_id, status, priority, start_date, deadline,
            budget_cents, completed_at, archived_at, created_at
     FROM projects WHERE id = ?`,
    [id],
  );
}

export function restoreProjectStatement(row: ProjectRow, now: string): Statement {
  return {
    sql: `INSERT INTO projects
            (id, name, description, notes, client_id, type_id, status, priority, start_date, deadline,
             budget_cents, completed_at, archived_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      row.id,
      row.name,
      row.description,
      row.notes,
      row.clientId,
      row.typeId,
      row.status,
      row.priority,
      row.startDate,
      row.deadline,
      row.budgetCents,
      row.completedAt,
      row.archivedAt,
      row.createdAt,
      now,
    ],
  };
}

/** Événements et dépenses rattachés : supprimer le projet les garde, détachés (ON DELETE SET NULL). */
export async function listProjectLinks(db: Db, projectId: string): Promise<{ eventIds: string[]; transactionIds: string[] }> {
  const events = await db.query<{ id: string }>('SELECT id FROM events WHERE project_id = ?', [projectId]);
  const transactions = await db.query<{ id: string }>('SELECT id FROM transactions WHERE project_id = ?', [projectId]);
  return { eventIds: events.map((e) => e.id), transactionIds: transactions.map((t) => t.id) };
}

/** Rattache à nouveau des événements ou des transactions au projet restauré. */
export function relinkToProjectStatement(table: 'events' | 'transactions', ids: string[], projectId: string): Statement {
  return {
    sql: `UPDATE ${table} SET project_id = ? WHERE id IN (SELECT value FROM json_each(?))`,
    params: [projectId, JSON.stringify(ids)],
  };
}

/** Supprime le projet et ses échéances non reçues (les tâches suivent par cascade). */
export function deleteProjectStatements(projectId: string): Statement[] {
  return [
    { sql: "DELETE FROM payments WHERE project_id = ? AND status <> 'received'", params: [projectId] },
    { sql: 'DELETE FROM projects WHERE id = ?', params: [projectId] },
  ];
}
