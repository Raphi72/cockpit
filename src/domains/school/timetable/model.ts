import { parseISO } from 'date-fns';
import { addDaysISO, isTime, timeToMinutes } from '@/core/dates';
import type { AppColor } from '@/ui/data/ColorDot';
import { hasClassesOn, type SchoolPeriod } from '../periods/model';

/**
 * Emploi du temps (P15) : une semaine type, un créneau par cours. Les cours d'un jour sont calculés à
 * partir des créneaux, pendant les semestres et hors vacances : rien n'est recopié jour par jour.
 */

/** 1 = lundi … 7 = dimanche (ISO 8601). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 7: 'Dim' };

export type TimetableSlot = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: AppColor;
  /** Salle de la matière, quand le créneau n'en précise pas. */
  subjectRoom: string | null;
  weekday: Weekday;
  /** 'HH:MM' */
  startsAt: string;
  endsAt: string;
  /** « TD », « TP », « Amphi »… */
  label: string | null;
  room: string | null;
};

export type SlotInput = {
  subjectId: string | null;
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
  label: string;
  room: string;
};

export function validateSlot(input: SlotInput): Partial<Record<'subjectId' | 'time', string>> {
  const errors: Partial<Record<'subjectId' | 'time', string>> = {};
  if (!input.subjectId) errors.subjectId = 'Choisis la matière du cours.';
  if (!isTime(input.startsAt) || !isTime(input.endsAt)) errors.time = 'Heures invalides.';
  else if (input.endsAt <= input.startsAt) errors.time = 'La fin doit venir après le début.';
  return errors;
}

/** Jour de la semaine d'une date, de 1 (lundi) à 7 (dimanche). */
export function isoWeekday(day: string): Weekday {
  const js = parseISO(day).getDay();
  return (js === 0 ? 7 : js) as Weekday;
}

/** Salle où a lieu le cours : celle du créneau, sinon celle de la matière. */
export function slotRoom(slot: Pick<TimetableSlot, 'room' | 'subjectRoom'>): string | null {
  return slot.room ?? slot.subjectRoom;
}

/** « Maths · TD » */
export function slotTitle(slot: Pick<TimetableSlot, 'subjectName' | 'label'>): string {
  return slot.label ? `${slot.subjectName} · ${slot.label}` : slot.subjectName;
}

const bySlotTime = (a: TimetableSlot, b: TimetableSlot) => a.startsAt.localeCompare(b.startsAt) || a.endsAt.localeCompare(b.endsAt);

/** Un cours un jour donné : le créneau et son moment ('YYYY-MM-DDTHH:MM'). */
export type ClassOccurrence = { slot: TimetableSlot; day: string; start: string; end: string };

/** Les cours d'un jour : aucun en vacances ni hors semestre, sinon ceux de ce jour de la semaine. */
export function classesOn(slots: TimetableSlot[], periods: SchoolPeriod[], day: string): ClassOccurrence[] {
  if (!hasClassesOn(periods, day)) return [];
  const weekday = isoWeekday(day);
  return slots
    .filter((slot) => slot.weekday === weekday)
    .sort(bySlotTime)
    .map((slot) => ({ slot, day, start: `${day}T${slot.startsAt}`, end: `${day}T${slot.endsAt}` }));
}

/** Les cours de [from, to[. */
export function classesBetween(slots: TimetableSlot[], periods: SchoolPeriod[], from: string, to: string): ClassOccurrence[] {
  if (slots.length === 0) return [];
  const result: ClassOccurrence[] = [];
  for (let day = from; day < to; day = addDaysISO(day, 1)) result.push(...classesOn(slots, periods, day));
  return result;
}

/** Le cours en cours ou le prochain du jour, à `minutes` (depuis minuit) ; `null` s'il n'y en a plus. */
export function currentOrNextClass(classes: ClassOccurrence[], minutes: number): { occurrence: ClassOccurrence; now: boolean } | null {
  for (const occurrence of classes) {
    const start = timeToMinutes(occurrence.slot.startsAt);
    const end = timeToMinutes(occurrence.slot.endsAt);
    if (minutes < end) return { occurrence, now: minutes >= start };
  }
  return null;
}

// ─── Grille de la semaine type ──────────────────────────────────────────────

/** Jours montrés dans la grille : du lundi au vendredi, et le samedi ou le dimanche s'ils ont des cours. */
export function gridWeekdays(slots: Pick<TimetableSlot, 'weekday'>[]): Weekday[] {
  return WEEKDAYS.filter((day) => day <= 5 || slots.some((slot) => slot.weekday === day));
}

/** Heures montrées : de 8 h à 18 h au moins, élargies aux cours plus tôt ou plus tard. */
export function gridHours(slots: Pick<TimetableSlot, 'startsAt' | 'endsAt'>[]): { first: number; last: number } {
  let first = 8;
  let last = 18;
  for (const slot of slots) {
    first = Math.min(first, Math.floor(timeToMinutes(slot.startsAt) / 60));
    last = Math.max(last, Math.ceil(timeToMinutes(slot.endsAt) / 60));
  }
  return { first, last };
}

export type SlotBlock = { slot: TimetableSlot; lane: number; lanes: number };

/**
 * Les créneaux d'un jour de la grille, côte à côte quand ils se chevauchent (un cours par couloir).
 * Un chevauchement n'est pas interdit : deux options au choix, par exemple.
 */
export function layoutDay(slots: TimetableSlot[]): SlotBlock[] {
  const sorted = [...slots].sort(bySlotTime);
  const blocks: SlotBlock[] = [];
  let cluster: SlotBlock[] = [];
  let clusterEnd = '';
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((b) => b.lane + 1));
    for (const block of cluster) blocks.push({ ...block, lanes });
    cluster = [];
  };
  for (const slot of sorted) {
    if (cluster.length > 0 && slot.startsAt >= clusterEnd) flush();
    const taken = new Set(cluster.filter((b) => b.slot.endsAt > slot.startsAt).map((b) => b.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    cluster.push({ slot, lane, lanes: 1 });
    clusterEnd = cluster.length === 1 || slot.endsAt > clusterEnd ? slot.endsAt : clusterEnd;
  }
  if (cluster.length > 0) flush();
  return blocks;
}

/** Heures de cours par semaine (la semaine type), en minutes. */
export function weeklyMinutes(slots: Pick<TimetableSlot, 'startsAt' | 'endsAt'>[]): number {
  return slots.reduce((sum, slot) => sum + timeToMinutes(slot.endsAt) - timeToMinutes(slot.startsAt), 0);
}
