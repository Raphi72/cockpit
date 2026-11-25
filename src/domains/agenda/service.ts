import type { BatchContext } from '@/core/batch';
import type { Statement } from '@/core/db';
import { shiftPaymentDueStatement } from '@/domains/finance/payments/repository';
import { shiftProjectDateStatement } from '@/domains/projects/repository';
import { shiftTaskDatesStatement } from '@/domains/tasks/repository';
import { moveTimingDate, moveTimingStart, timingColumns, timingOf, type AgendaEvent, type AgendaItem } from './model';
import { endSeriesBefore, formatRecurrence, occurrenceMoment, parseRecurrence, type EventException } from './recurrence';
import {
  deleteEventStatement,
  deleteExceptionStatement,
  restoreEventStatement,
  shiftEventStatement,
  updateEventStatement,
  upsertExceptionStatement,
} from './repository';

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

// ─── Événements récurrents : une fois, ou toute la série (P15) ──────────────

type SeriesEvent = Pick<AgendaEvent, 'id' | 'startsAt' | 'endsAt' | 'recurrence'>;

/** Remet l'occurrence comme elle était : son exception d'avant, ou aucune. */
function restoreException(eventId: string, occurrence: string, previous: EventException | undefined, ctx: BatchContext): Statement[] {
  return [previous ? upsertExceptionStatement(ctx.newId(), previous, ctx.now) : deleteExceptionStatement(eventId, occurrence)];
}

/**
 * Déplacer une seule occurrence (glissée dans le calendrier, ou modifiée « cette fois » dans le
 * panneau) : la série ne bouge pas, une exception retient son nouveau moment. Revenue à sa place
 * prévue, l'occurrence n'a plus d'exception. `previous` est l'exception qu'elle avait, pour l'annulation.
 */
export function buildMoveOccurrenceBatch(
  event: SeriesEvent,
  occurrence: string,
  moment: { startsAt: string; endsAt: string | null },
  previous: EventException | undefined,
  ctx: BatchContext,
): MoveBatch {
  const planned = occurrenceMoment(event, [], occurrence);
  const back = planned.startsAt === moment.startsAt && planned.endsAt === moment.endsAt;
  const exception: EventException = { eventId: event.id, occurrence, kind: 'moved', ...moment };
  return {
    statements: [back ? deleteExceptionStatement(event.id, occurrence) : upsertExceptionStatement(ctx.newId(), exception, ctx.now)],
    undo: restoreException(event.id, occurrence, previous, ctx),
  };
}

/** Supprimer « cette fois » : l'occurrence est annulée, le reste de la série ne bouge pas. */
export function buildCancelOccurrenceBatch(
  eventId: string,
  occurrence: string,
  previous: EventException | undefined,
  ctx: BatchContext,
): MoveBatch {
  const exception: EventException = { eventId, occurrence, kind: 'cancelled', startsAt: null, endsAt: null };
  return {
    statements: [upsertExceptionStatement(ctx.newId(), exception, ctx.now)],
    undo: restoreException(eventId, occurrence, previous, ctx),
  };
}

/**
 * Supprimer « celle-ci et les suivantes » : la série s'arrête la veille. `null` si c'est la toute
 * première occurrence : il ne resterait rien, c'est alors l'événement entier qu'il faut supprimer.
 */
export function buildEndSeriesBatch(event: SeriesEvent, occurrence: string, now: string): MoveBatch | null {
  const rule = parseRecurrence(event.recurrence);
  if (!rule || occurrence <= event.startsAt.slice(0, 10)) return null;
  return {
    statements: [updateEventStatement(event.id, { recurrence: formatRecurrence(endSeriesBefore(rule, occurrence)) }, now)],
    undo: [updateEventStatement(event.id, { recurrence: event.recurrence }, now)],
  };
}

/** Supprimer l'événement, toute sa série comprise ; l'annulation le ramène avec ses exceptions. */
export function buildDeleteEventBatch(event: AgendaEvent, exceptions: EventException[], ctx: BatchContext): MoveBatch {
  return {
    statements: [deleteEventStatement(event.id)],
    undo: [
      restoreEventStatement(event, ctx.now),
      ...exceptions.map((exception) => upsertExceptionStatement(ctx.newId(), exception, ctx.now)),
    ],
  };
}
