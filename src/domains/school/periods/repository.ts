import type { Db, Statement } from '@/core/db';
import type { PeriodInput, SchoolPeriod } from './model';

export function listPeriods(db: Db): Promise<SchoolPeriod[]> {
  return db.query<SchoolPeriod>('SELECT id, kind, name, starts_on, ends_on FROM school_periods ORDER BY starts_on, name');
}

export function insertPeriodStatement(id: string, input: PeriodInput, now: string): Statement {
  return {
    sql: `INSERT INTO school_periods (id, kind, name, starts_on, ends_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [id, input.kind, input.name.trim(), input.startsOn, input.endsOn, now, now],
  };
}

export function updatePeriodStatement(id: string, input: PeriodInput, now: string): Statement {
  return {
    sql: 'UPDATE school_periods SET name = ?, starts_on = ?, ends_on = ?, updated_at = ? WHERE id = ?',
    params: [input.name.trim(), input.startsOn, input.endsOn, now, id],
  };
}

export function deletePeriodStatement(id: string): Statement {
  return { sql: 'DELETE FROM school_periods WHERE id = ?', params: [id] };
}
