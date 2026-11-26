import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addDaysISO, isTime } from '@/core/dates';
import type { IconKey } from '@/domains/day/model';
import type { PaletteKey } from '@/ui/data/ColorDot';

/**
 * Sport, habitudes et objectifs (V2, étape 6, P20). Une habitude est faite un jour si on l'a cochée,
 * ou si un bloc de son module ce jour-là est marqué fait. Les séries, les taux et la progression sont
 * calculés à partir des coches et des blocs, jamais stockés.
 */

export type Frequency = 'daily' | 'weekly' | 'days';

export const FREQUENCY_LABELS: Record<Frequency, string> = { daily: 'Chaque jour', weekly: 'X fois par semaine', days: 'Certains jours' };

export type Habit = {
  id: string;
  name: string;
  icon: IconKey;
  color: PaletteKey;
  frequency: Frequency;
  timesPerWeek: number | null;
  /** Jours choisis (1 = lundi … 7 = dimanche), pour « certains jours ». */
  weekdays: number[];
  reminderTime: string | null;
  moduleId: string | null;
  goalId: string | null;
  sortOrder: number;
};

export type HabitInput = Omit<Habit, 'id' | 'sortOrder'>;

export function validateHabit(input: HabitInput): Partial<Record<'name' | 'frequency' | 'reminderTime', string>> {
  const errors: Partial<Record<'name' | 'frequency' | 'reminderTime', string>> = {};
  if (input.name.trim() === '') errors.name = 'Donne un nom à l’habitude (« Sport », « Lire 20 minutes »…).';
  if (input.frequency === 'weekly' && !(input.timesPerWeek && input.timesPerWeek >= 1 && input.timesPerWeek <= 7)) {
    errors.frequency = 'Entre 1 et 7 fois par semaine.';
  }
  if (input.frequency === 'days' && input.weekdays.length === 0) errors.frequency = 'Choisis au moins un jour.';
  if (input.reminderTime && !isTime(input.reminderTime)) errors.reminderTime = 'Heure invalide.';
  return errors;
}

/** « 3 fois par semaine », « lun., mer., ven. », « chaque jour » */
export function frequencyText(habit: Pick<Habit, 'frequency' | 'timesPerWeek' | 'weekdays'>): string {
  if (habit.frequency === 'daily') return 'chaque jour';
  if (habit.frequency === 'weekly') return `${habit.timesPerWeek} fois par semaine`;
  const names = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  return [...habit.weekdays].sort().map((d) => names[d - 1]).join(', ');
}

/** Jour de la semaine ISO (1 = lundi … 7 = dimanche). */
export function isoWeekday(day: string): number {
  const js = new Date(`${day}T12:00:00`).getDay();
  return js === 0 ? 7 : js;
}

/** Le lundi de la semaine qui contient ce jour (les habitudes comptent du lundi au dimanche). */
export function mondayOf(day: string): string {
  return addDaysISO(day, 1 - isoWeekday(day));
}

/** Ce jour-là, l'habitude est-elle attendue ? (« X fois par semaine » : n'importe quel jour.) */
export function isScheduled(habit: Pick<Habit, 'frequency' | 'weekdays'>, day: string): boolean {
  if (habit.frequency === 'days') return habit.weekdays.includes(isoWeekday(day));
  return true;
}

/** Les jours où une habitude est faite : ses coches, et les jours où un bloc de son module est fait. */
export function doneDays(habit: Pick<Habit, 'id' | 'moduleId'>, logs: { habitId: string; day: string }[], doneBlocks: { templateId: string | null; date: string }[]): Set<string> {
  const days = new Set(logs.filter((l) => l.habitId === habit.id).map((l) => l.day));
  if (habit.moduleId) for (const block of doneBlocks) if (block.templateId === habit.moduleId) days.add(block.date);
  return days;
}

/** Combien de fois dans la semaine (du lundi), et combien attendu. */
export function weekProgress(habit: Pick<Habit, 'frequency' | 'timesPerWeek' | 'weekdays'>, done: Set<string>, day: string): { done: number; target: number } {
  const monday = mondayOf(day);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
  const count = days.filter((d) => done.has(d)).length;
  const target = habit.frequency === 'daily' ? 7 : habit.frequency === 'weekly' ? (habit.timesPerWeek ?? 1) : habit.weekdays.length;
  return { done: count, target };
}

/**
 * Série en cours : jours prévus faits d'affilée (chaque jour, certains jours), ou semaines réussies
 * d'affilée (X fois par semaine). Aujourd'hui (ou la semaine en cours) compte s'il est déjà réussi ;
 * sinon la série court encore jusqu'à hier (ou la semaine dernière).
 */
export function streak(habit: Pick<Habit, 'frequency' | 'timesPerWeek' | 'weekdays'>, done: Set<string>, today: string): { count: number; unit: 'jour' | 'semaine' } {
  if (habit.frequency === 'weekly') {
    let monday = mondayOf(today);
    let count = 0;
    if (weekProgress(habit, done, monday).done >= (habit.timesPerWeek ?? 1)) count += 1;
    monday = addDaysISO(monday, -7);
    for (let i = 0; i < 520; i += 1) {
      if (weekProgress(habit, done, monday).done < (habit.timesPerWeek ?? 1)) break;
      count += 1;
      monday = addDaysISO(monday, -7);
    }
    return { count, unit: 'semaine' };
  }
  let count = 0;
  let day = done.has(today) ? today : addDaysISO(today, -1);
  for (let i = 0; i < 3650; i += 1) {
    if (isScheduled(habit, day)) {
      if (!done.has(day)) break;
      count += 1;
    }
    day = addDaysISO(day, -1);
  }
  return { count, unit: 'jour' };
}

/** « 12 jours d'affilée », « 3 semaines d'affilée », ou rien sans série. */
export function streakText({ count, unit }: { count: number; unit: 'jour' | 'semaine' }): string | null {
  if (count === 0) return null;
  return `${count} ${unit}${count > 1 ? 's' : ''} d’affilée`;
}

/** Taux sur les 30 derniers jours : jours prévus faits / jours prévus (pour X fois par semaine : semaines). */
export function successRate(habit: Pick<Habit, 'frequency' | 'timesPerWeek' | 'weekdays'>, done: Set<string>, today: string, days = 30): number | null {
  let expected = 0;
  let hit = 0;
  if (habit.frequency === 'weekly') {
    const target = habit.timesPerWeek ?? 1;
    for (let monday = mondayOf(addDaysISO(today, -(days - 1))); monday <= today; monday = addDaysISO(monday, 7)) {
      expected += 1;
      if (weekProgress(habit, done, monday).done >= target) hit += 1;
    }
  } else {
    for (let i = 0; i < days; i += 1) {
      const day = addDaysISO(today, -i);
      if (!isScheduled(habit, day)) continue;
      expected += 1;
      if (done.has(day)) hit += 1;
    }
  }
  return expected === 0 ? null : hit / expected;
}

export type GridDay = { day: string; state: 'done' | 'missed' | 'off' | 'future' };

/** La grille d'un mois : chaque jour fait, manqué (prévu, passé, pas fait), sans objet, ou à venir. */
export function monthGrid(habit: Pick<Habit, 'frequency' | 'weekdays'>, done: Set<string>, month: string, today: string): GridDay[] {
  const first = `${month}-01`;
  const days: GridDay[] = [];
  for (let day = first; day.slice(0, 7) === month; day = addDaysISO(day, 1)) {
    const state = done.has(day) ? 'done' : day > today ? 'future' : isScheduled(habit, day) && day < today ? 'missed' : 'off';
    days.push({ day, state });
  }
  return days;
}

// ─── Objectifs ──────────────────────────────────────────────────────────────

export type GoalStep = { id: string; goalId: string; title: string; doneAt: string | null; sortOrder: number };

export type Goal = {
  id: string;
  title: string;
  dueDate: string | null;
  notes: string | null;
  achievedAt: string | null;
  sortOrder: number;
  steps: GoalStep[];
};

/** Progression d'un objectif : ses étapes faites ; atteint, il est complet. `null` sans étape. */
export function goalProgress(goal: Pick<Goal, 'steps' | 'achievedAt'>): { done: number; total: number; ratio: number } | null {
  if (goal.achievedAt) return { done: goal.steps.length, total: goal.steps.length, ratio: 1 };
  if (goal.steps.length === 0) return null;
  const done = goal.steps.filter((s) => s.doneAt !== null).length;
  return { done, total: goal.steps.length, ratio: done / goal.steps.length };
}

// ─── Séances ────────────────────────────────────────────────────────────────

export type ExerciseKind = 'strength' | 'cardio';

export type Exercise = { id: string; name: string; kind: ExerciseKind };

export type WorkoutSet = {
  exerciseId: string;
  reps: number | null;
  weightKg: number | null;
  durationMin: number | null;
  distanceKm: number | null;
};

export type Workout = {
  id: string;
  blockId: string | null;
  date: string;
  feeling: number | null;
  notes: string | null;
  sets: (WorkoutSet & { position: number })[];
};

export const FEELINGS = ['Dure', 'Difficile', 'Correcte', 'Bonne', 'Excellente'];

/** Un bloc de sport : posé depuis le module Sport, ou avec l'icône haltère. On peut y noter sa séance. */
export function isSportBlock(block: { templateId: string | null; icon: string }): boolean {
  return block.templateId === 'module-sport' || block.icon === 'dumbbell';
}

/**
 * Le meilleur d'une séance pour un exercice : la charge la plus lourde (muscu), ou le plus de répétitions
 * sans charge (poids du corps) ; la distance, sinon la durée (cardio).
 */
export function sessionBest(sets: WorkoutSet[], kind: ExerciseKind): number | null {
  const weighted = sets.some((s) => s.weightKg !== null);
  const values = sets
    .map((s) => (kind === 'strength' ? (weighted ? s.weightKg : s.reps) : (s.distanceKm ?? s.durationMin)))
    .filter((v): v is number => v !== null);
  return values.length ? Math.max(...values) : null;
}

/** La progression d'un exercice : son meilleur résultat séance après séance, dans l'ordre des dates. */
export function exerciseProgress(workouts: Workout[], exercise: Exercise): { date: string; value: number }[] {
  return [...workouts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((w) => {
      const value = sessionBest(w.sets.filter((s) => s.exerciseId === exercise.id), exercise.kind);
      return value === null ? [] : [{ date: w.date, value }];
    });
}

/** « 3 × 10 × 40 kg » ou « 30 min · 5 km » : un exercice dans une séance. */
export function setsSummary(sets: WorkoutSet[], kind: ExerciseKind): string {
  if (kind === 'cardio') {
    const minutes = sets.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    const km = sets.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
    return [minutes ? `${Math.round(minutes)} min` : null, km ? `${String(Math.round(km * 10) / 10).replace('.', ',')} km` : null].filter(Boolean).join(' · ');
  }
  const groups = new Map<string, number>();
  for (const s of sets) {
    const key = `${s.reps ?? '?'} × ${s.weightKg ? `${String(s.weightKg).replace('.', ',')} kg` : 'poids du corps'}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups].map(([key, count]) => (count > 1 ? `${count} × ${key}` : key)).join(', ');
}

// ─── Revue de la semaine ────────────────────────────────────────────────────

export type WeekReview = {
  monday: string;
  workMinutes: number;
  schoolMinutes: number;
  sportMinutes: number;
  habits: { name: string; done: number; target: number }[];
  homeworkDone: number;
  tasksDone: number;
  revenueCents: number;
};

/** « Semaine du 23 au 29 novembre » (ou « du 30 novembre au 6 décembre »). */
export function weekLabel(monday: string): string {
  const sunday = addDaysISO(monday, 6);
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7);
  const start = format(new Date(`${monday}T12:00:00`), sameMonth ? 'd' : 'd MMMM', { locale: fr });
  return `Semaine du ${start} au ${format(new Date(`${sunday}T12:00:00`), 'd MMMM', { locale: fr })}`;
}

/** Une phrase de bilan, courte et encourageante, à partir des chiffres de la semaine. */
export function reviewSentence(review: WeekReview): string {
  const kept = review.habits.filter((h) => h.done >= h.target).length;
  const hours = (minutes: number) => `${Math.round(minutes / 6) / 10} h`.replace('.', ',');
  const parts = [
    review.workMinutes > 0 ? `${hours(review.workMinutes)} de travail` : null,
    review.schoolMinutes > 0 ? `${hours(review.schoolMinutes)} de cours et devoirs` : null,
    review.sportMinutes > 0 ? `${hours(review.sportMinutes)} de sport` : null,
  ].filter(Boolean);
  const habits = review.habits.length > 0 ? `${kept} habitude${kept > 1 ? 's' : ''} sur ${review.habits.length} tenue${kept > 1 ? 's' : ''}` : null;
  if (parts.length === 0 && !habits) return 'Une semaine sans bloc fait ni habitude : la prochaine sera la bonne.';
  const tone = review.habits.length > 0 && kept === review.habits.length ? 'Belle semaine' : 'Cette semaine';
  return `${tone} : ${[...parts, habits].filter(Boolean).join(', ')}.`;
}
