import type { Statement } from '@/core/db';
import { shiftPaymentDueStatement } from '@/domains/finance/payments/repository';
import { shiftProjectDateStatement } from '@/domains/projects/repository';
import { shiftTaskDatesStatement } from '@/domains/tasks/repository';
import { moveTimingDate, moveTimingStart, timingColumns, timingOf, type AgendaEvent, type AgendaItem } from './model';
import { shiftEventStatement, updateEventStatement } from './repository';

/** Un déplacement dans le calendrier et de quoi l'annuler. */
export type MoveBatch = { statements: Statement[]; undo: Statement[] };

/**
 * Glisser un élément du calendrier de `days` jours : la date change là où elle est stockée (P8).
 * Une tâche décale son début et sa deadline, un projet son début ou sa deadline, un encaissement sa
 * date prévue, un événement ses jours (heures gardées). L'annulation décale d'autant en sens inverse.
 */
export function buildShiftBatch(item: AgendaItem, days: number, now: string): MoveBatch {
  const shift = (by: number): Statement => {
    switch (item.source) {
      case 'task':
        return shiftTaskDatesStatement(item.id, by, now);
      case 'payment':
        return shiftPaymentDueStatement(item.id, by, now);
      case 'event':
        return shiftEventStatement(item.id, by, now);
      case 'project':
        return shiftProjectDateStatement(item.id, item.kind === 'project_start' ? 'startDate' : 'deadline', by, now);
    }
  };
  return { statements: [shift(days)], undo: [shift(-days)] };
}

/**
 * Un événement à heure fixe déposé sur un créneau de la grille : nouveau jour et nouvelle heure,
 * la durée gardée. L'annulation remet les horaires d'avant.
 */
export function buildRetimeEventBatch(event: AgendaEvent, date: string, startTime: string, now: string): MoveBatch {
  const timing = moveTimingStart(moveTimingDate(timingOf(event), date), startTime);
  const before = { allDay: event.allDay, startsAt: event.startsAt, endsAt: event.endsAt };
  return {
    statements: [updateEventStatement(event.id, timingColumns(timing), now)],
    undo: [updateEventStatement(event.id, before, now)],
  };
}
