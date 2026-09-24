import { nowTimestamp, todayISO } from './dates';
import { newId } from './ids';

/**
 * Contexte d'un lot d'écritures : horodatage, date du jour et générateur d'IDs.
 * Passé en paramètre aux services, pour que les tests puissent le fixer.
 */
export type BatchContext = { now: string; today: string; newId: () => string };

export function batchContext(): BatchContext {
  return { now: nowTimestamp(), today: todayISO(), newId };
}
