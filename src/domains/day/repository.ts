import type { Db, Statement } from '@/core/db';
import type { BlockInput, BlockStatus, DayBlock, Module, ModuleInput, WeekTemplate, WeekTemplateBlock } from './model';

// ─── Modules ────────────────────────────────────────────────────────────────

/** Les modules de la bibliothèque et ceux « pour une fois » (à caser), dans l'ordre de création. */
export async function listModules(db: Db): Promise<Module[]> {
  const rows = await db.query<Omit<Module, 'oneOff'> & { oneOff: number }>(
    'SELECT id, name, icon, color, duration_min, mode, sort_order, one_off FROM block_templates ORDER BY sort_order, name',
  );
  return rows.map((row) => ({ ...row, oneOff: row.oneOff === 1 }));
}

export function insertModuleStatement(id: string, input: ModuleInput, now: string): Statement {
  return {
    sql: `INSERT INTO block_templates (id, name, icon, color, duration_min, mode, one_off, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM block_templates), 0) + 1, ?, ?)`,
    params: [id, input.name.trim(), input.icon, input.color, input.durationMin, input.mode, input.oneOff ? 1 : 0, now, now],
  };
}

export function updateModuleStatement(id: string, input: ModuleInput, now: string): Statement {
  return {
    sql: 'UPDATE block_templates SET name = ?, icon = ?, color = ?, duration_min = ?, mode = ?, updated_at = ? WHERE id = ?',
    params: [input.name.trim(), input.icon, input.color, input.durationMin, input.mode, now, id],
  };
}

export function deleteModuleStatement(id: string): Statement {
  return { sql: 'DELETE FROM block_templates WHERE id = ?', params: [id] };
}

// ─── Blocs ──────────────────────────────────────────────────────────────────

const BLOCK_COLUMNS = 'id, template_id, date, starts_at, ends_at, title, icon, color, mode, status';

/** Les blocs de [from, to[, dans l'ordre des jours et des heures. */
export function listBlocks(db: Db, from: string, to: string): Promise<DayBlock[]> {
  return db.query<DayBlock>(
    `SELECT ${BLOCK_COLUMNS} FROM day_blocks WHERE date >= ? AND date < ? ORDER BY date, starts_at, ends_at`,
    [from, to],
  );
}

export function getBlock(db: Db, id: string): Promise<DayBlock | undefined> {
  return db.queryOne<DayBlock>(`SELECT ${BLOCK_COLUMNS} FROM day_blocks WHERE id = ?`, [id]);
}

export function insertBlockStatement(id: string, input: BlockInput, now: string): Statement {
  return {
    sql: `INSERT INTO day_blocks (id, template_id, date, starts_at, ends_at, title, icon, color, mode, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id,
      input.templateId,
      input.date,
      input.startsAt,
      input.endsAt,
      input.title.trim(),
      input.icon,
      input.color,
      input.mode,
      input.status ?? 'planned',
      now,
      now,
    ],
  };
}

export type BlockPatch = Partial<Pick<DayBlock, 'date' | 'startsAt' | 'endsAt' | 'title' | 'icon' | 'color' | 'status'>>;

const PATCH_COLUMNS: Record<keyof BlockPatch, string> = {
  date: 'date',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  title: 'title',
  icon: 'icon',
  color: 'color',
  status: 'status',
};

export function updateBlockStatement(id: string, patch: BlockPatch, now: string): Statement {
  const keys = Object.keys(patch) as (keyof BlockPatch)[];
  return {
    sql: `UPDATE day_blocks SET ${keys.map((k) => `${PATCH_COLUMNS[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    params: [...keys.map((k) => patch[k] ?? null), now, id],
  };
}

export function deleteBlockStatement(id: string): Statement {
  return { sql: 'DELETE FROM day_blocks WHERE id = ?', params: [id] };
}

/** Avant de supprimer un bloc : ses tâches, qui en sortent (ON DELETE SET NULL), pour « Annuler ». */
export async function listBlockTaskIds(db: Db, blockId: string): Promise<string[]> {
  return (await db.query<{ id: string }>('SELECT id FROM tasks WHERE block_id = ?', [blockId])).map((row) => row.id);
}

/** Range des tâches dans un bloc (ou les en sort, avec `null`). */
export function setTasksBlockStatement(taskIds: string[], blockId: string | null, now: string): Statement {
  return {
    sql: `UPDATE tasks SET block_id = ?, updated_at = ? WHERE id IN (${taskIds.map(() => '?').join(', ')})`,
    params: [blockId, now, ...taskIds],
  };
}

export function setBlockStatusStatement(id: string, status: BlockStatus, now: string): Statement {
  return updateBlockStatement(id, { status }, now);
}

// ─── Semaines types ─────────────────────────────────────────────────────────

export function listWeekTemplates(db: Db): Promise<WeekTemplate[]> {
  return db.query<WeekTemplate>(
    `SELECT w.id, w.name, w.sort_order,
            (SELECT COUNT(*) FROM week_template_blocks b WHERE b.week_template_id = w.id) AS block_count
     FROM week_templates w
     ORDER BY w.sort_order, w.name`,
  );
}

export function listWeekTemplateBlocks(db: Db, weekTemplateId: string): Promise<WeekTemplateBlock[]> {
  return db.query<WeekTemplateBlock>(
    `SELECT id, week_template_id, template_id, weekday, starts_at, ends_at, title, icon, color, mode
     FROM week_template_blocks WHERE week_template_id = ? ORDER BY weekday, starts_at`,
    [weekTemplateId],
  );
}

export function insertWeekTemplateStatement(id: string, name: string, now: string): Statement {
  return {
    sql: `INSERT INTO week_templates (id, name, sort_order, created_at, updated_at)
          VALUES (?, ?, COALESCE((SELECT MAX(sort_order) FROM week_templates), 0) + 1, ?, ?)`,
    params: [id, name.trim(), now, now],
  };
}

export function renameWeekTemplateStatement(id: string, name: string, now: string): Statement {
  return { sql: 'UPDATE week_templates SET name = ?, updated_at = ? WHERE id = ?', params: [name.trim(), now, id] };
}

export function deleteWeekTemplateStatement(id: string): Statement {
  return { sql: 'DELETE FROM week_templates WHERE id = ?', params: [id] };
}

export function clearWeekTemplateBlocksStatement(weekTemplateId: string): Statement {
  return { sql: 'DELETE FROM week_template_blocks WHERE week_template_id = ?', params: [weekTemplateId] };
}

export function insertWeekTemplateBlockStatement(
  id: string,
  weekTemplateId: string,
  block: Omit<WeekTemplateBlock, 'id' | 'weekTemplateId'>,
  now: string,
): Statement {
  return {
    sql: `INSERT INTO week_template_blocks
            (id, week_template_id, template_id, weekday, starts_at, ends_at, title, icon, color, mode, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      id,
      weekTemplateId,
      block.templateId,
      block.weekday,
      block.startsAt,
      block.endsAt,
      block.title,
      block.icon,
      block.color,
      block.mode,
      now,
    ],
  };
}

/** Lignes brutes (pour « Annuler » une suppression). */
export function rawRows(db: Db, table: 'week_templates' | 'week_template_blocks' | 'block_templates', column: string, id: string) {
  return db.query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${column} = ? ORDER BY rowid`, [id]);
}
