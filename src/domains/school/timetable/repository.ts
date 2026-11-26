import type { Db, Statement } from '@/core/db';
import type { SlotInput, TimetableSlot } from './model';

export function listSlots(db: Db): Promise<TimetableSlot[]> {
  return db.query<TimetableSlot>(
    `SELECT c.id, c.subject_id, s.name AS subject_name, s.color AS subject_color, s.room AS subject_room,
            c.weekday, c.starts_at, c.ends_at, c.label, c.room
     FROM timetable_slots c
     JOIN subjects s ON s.id = c.subject_id
     ORDER BY c.weekday, c.starts_at, s.sort_order`,
  );
}

export function insertSlotStatement(id: string, input: SlotInput, now: string): Statement {
  return {
    sql: `INSERT INTO timetable_slots (id, subject_id, weekday, starts_at, ends_at, label, room, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, input.subjectId, input.weekday, input.startsAt, input.endsAt, input.label.trim() || null, input.room.trim() || null, now, now],
  };
}

export function updateSlotStatement(id: string, input: SlotInput, now: string): Statement {
  return {
    sql: `UPDATE timetable_slots SET subject_id = ?, weekday = ?, starts_at = ?, ends_at = ?, label = ?, room = ?, updated_at = ?
          WHERE id = ?`,
    params: [input.subjectId, input.weekday, input.startsAt, input.endsAt, input.label.trim() || null, input.room.trim() || null, now, id],
  };
}

export function deleteSlotStatement(id: string): Statement {
  return { sql: 'DELETE FROM timetable_slots WHERE id = ?', params: [id] };
}

/** Le créneau tel qu'il est en base, pour le remettre avec « Annuler ». */
export function getSlotRow(db: Db, id: string): Promise<Record<string, unknown> | undefined> {
  return db.queryOne<Record<string, unknown>>('SELECT * FROM timetable_slots WHERE id = ?', [id]);
}
