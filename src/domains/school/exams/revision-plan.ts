import { addDaysISO } from '@/core/dates';
import { freeSlots, type Interval } from '@/domains/day/model';

/**
 * Révisions à rebours d'un examen (V2, étape 5) : à J-7, J-3 et J-1, un bloc « Révision » d'une heure,
 * dans le premier créneau libre du soir (de 17 h à 22 h). Sans créneau libre, 18 h, signalé.
 */

export const REVISION_OFFSETS = [7, 3, 1];
export const REVISION_WINDOW = { start: 17 * 60, end: 22 * 60 };
export const REVISION_MIN = 60;
export const REVISION_FALLBACK = 18 * 60;

/** Les jours de révision encore à venir (aujourd'hui compris) avant l'examen. */
export function revisionDays(examDate: string, today: string): { offset: number; day: string }[] {
  return REVISION_OFFSETS.map((offset) => ({ offset, day: addDaysISO(examDate, -offset) })).filter(({ day }) => day >= today);
}

/** Le créneau d'une révision ce jour-là, d'après ce qui est déjà pris ; `taken` s'il a fallu chevaucher. */
export function revisionSlot(busy: Interval[], earliest = REVISION_WINDOW.start): Interval & { taken: boolean } {
  const [slot] = freeSlots(busy, Math.max(earliest, REVISION_WINDOW.start), REVISION_WINDOW.end, REVISION_MIN);
  if (slot) {
    const start = Math.ceil(slot.start / 15) * 15;
    return { start, end: start + REVISION_MIN, taken: false };
  }
  return { start: REVISION_FALLBACK, end: REVISION_FALLBACK + REVISION_MIN, taken: true };
}
