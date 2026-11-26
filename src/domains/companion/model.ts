/**
 * Le compagnon (V2, étape 7, P21) : il parle peu, mais au bon moment. Écran du matin, mode focus
 * (minuteur du bloc et Pomodoro), mini-fenêtre « En ce moment », petites célébrations et sons.
 * Ici, les règles pures ; rien n'est stocké en base à part les réglages.
 */

// ─── Écran du matin ─────────────────────────────────────────────────────────

/** L'écran du matin n'apparaît qu'à la première ouverture du jour, et seulement le matin (avant midi). */
export const MORNING_UNTIL_MIN = 12 * 60;

export function shouldShowMorning(input: { enabled: boolean; lastShown: string | null; today: string; minutes: number }): boolean {
  return input.enabled && input.lastShown !== input.today && input.minutes < MORNING_UNTIL_MIN;
}

const plural = (count: number, word: string, plural = `${word}s`) => `${count} ${count > 1 ? plural : word}`;

/**
 * La journée en une phrase : « 3 blocs, 2 cours et 4 tâches aujourd'hui. », ou « Rien de prévu
 * aujourd'hui : une journée à remplir comme tu veux. »
 */
export function morningSentence(input: { blocks: number; classes: number; tasks: number; events: number }): string {
  const parts = [
    input.blocks > 0 ? plural(input.blocks, 'bloc') : null,
    input.classes > 0 ? plural(input.classes, 'cours', 'cours') : null,
    input.events > 0 ? plural(input.events, 'rendez-vous', 'rendez-vous') : null,
    input.tasks > 0 ? plural(input.tasks, 'tâche') : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return 'Rien de prévu aujourd’hui : une journée à remplir comme tu veux.';
  const list = parts.length === 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} et ${parts.slice(-1).join('')}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} aujourd’hui.`;
}

// ─── Mode focus et Pomodoro ─────────────────────────────────────────────────

export const POMODORO_WORK_CHOICES = [15, 20, 25, 30, 45, 50] as const;
export const POMODORO_BREAK_CHOICES = [5, 10, 15] as const;

/** « 24:59 », « 1:02:03 » : le temps qui reste, arrondi à la seconde supérieure. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

// ─── Séance de focus ────────────────────────────────────────────────────────

/** Durées proposées au lancement d'une séance (en minutes) ; « Autre » permet n'importe laquelle. */
export const FOCUS_DURATIONS = [15, 25, 45, 60, 90] as const;
export const POMODORO_ROUND_CHOICES = [2, 3, 4, 6] as const;
/** Au-delà, la liste des tâches défile toute seule, comme un générique de fin de film. */
export const FOCUS_LIST_VISIBLE = 5;
/** « +10 min » sur l'écran de fin. */
export const FOCUS_EXTRA_MS = 10 * 60_000;

/**
 * Le minuteur d'une séance : sa durée totale, le temps déjà écoulé au dernier arrêt, et depuis quand il
 * tourne (`null` : en pause). Tout se calcule depuis l'heure : rien ne dérive si l'écran se fige.
 */
export type FocusClock = { totalMs: number; elapsedMs: number; runningSince: number | null };

export function startClock(totalMs: number, now: number): FocusClock {
  return { totalMs, elapsedMs: 0, runningSince: now };
}

export function clockElapsed(clock: FocusClock, now: number): number {
  const running = clock.runningSince === null ? 0 : now - clock.runningSince;
  return Math.min(clock.totalMs, clock.elapsedMs + running);
}

export function clockRemaining(clock: FocusClock, now: number): number {
  return clock.totalMs - clockElapsed(clock, now);
}

export function isClockPaused(clock: FocusClock): boolean {
  return clock.runningSince === null;
}

export function pauseClock(clock: FocusClock, now: number): FocusClock {
  return clock.runningSince === null ? clock : { ...clock, elapsedMs: clockElapsed(clock, now), runningSince: null };
}

export function resumeClock(clock: FocusClock, now: number): FocusClock {
  return clock.runningSince === null ? { ...clock, runningSince: now } : clock;
}

/** Prolonger (« +10 min ») : le temps s'ajoute à la fin et le minuteur repart. */
export function extendClock(clock: FocusClock, extraMs: number, now: number): FocusClock {
  return { totalMs: clock.totalMs + extraMs, elapsedMs: clockElapsed(clock, now), runningSince: now };
}

/** Une séance en Pomodoro : des tours de travail, séparés par des pauses ; elle dure tous les tours. */
export type FocusPomodoro = { workMin: number; breakMin: number; rounds: number };

export function pomodoroTotalMs(pomodoro: FocusPomodoro): number {
  return (pomodoro.rounds * pomodoro.workMin + (pomodoro.rounds - 1) * pomodoro.breakMin) * 60_000;
}

export type PomodoroPhase = { phase: 'work' | 'break'; round: number; phaseEndsAtMs: number };

/**
 * Où en est le Pomodoro après `elapsedMs` de séance : la phase, son tour, et l'instant (en temps de
 * séance) où elle finit. Le temps ajouté après le dernier tour (« +10 min ») prolonge ce dernier tour.
 */
export function pomodoroPhaseAt(pomodoro: FocusPomodoro, elapsedMs: number): PomodoroPhase {
  const work = pomodoro.workMin * 60_000;
  const rest = pomodoro.breakMin * 60_000;
  let start = 0;
  for (let round = 1; round <= pomodoro.rounds; round += 1) {
    if (elapsedMs < start + work || round === pomodoro.rounds) {
      return { phase: 'work', round, phaseEndsAtMs: round === pomodoro.rounds ? Math.max(start + work, elapsedMs) : start + work };
    }
    start += work;
    if (elapsedMs < start + rest) return { phase: 'break', round, phaseEndsAtMs: start + rest };
    start += rest;
  }
  return { phase: 'work', round: pomodoro.rounds, phaseEndsAtMs: elapsedMs };
}

/** Une ligne de la liste d'une séance : une tâche (ou un devoir) de Cockpit, ou un « autre chose » écrit au lancement. */
export type FocusItem = { key: string; title: string; taskId: string | null; tag: string | null };

/** Tout est fait : il y avait quelque chose à faire, et tout est coché. */
export function allFocusDone(items: Pick<FocusItem, 'key'>[], checked: ReadonlySet<string>): boolean {
  return items.length > 0 && items.every((item) => checked.has(item.key));
}

/** « 32 min », « 1 h 05 » : une durée de séance, arrondie à la minute. */
export function formatFocusDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}`;
}

/** Millisecondes jusqu'à une heure 'HH:MM' du jour (`now` : la date courante), jamais négatif. */
export function msUntil(time: string, now: Date): number {
  const [h, m] = time.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h ?? 0, m ?? 0, 0, 0);
  return Math.max(0, target.getTime() - now.getTime());
}

// ─── Célébrations ───────────────────────────────────────────────────────────

const DAY_MILESTONES = [3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365];
const WEEK_MILESTONES = [2, 3, 4, 6, 8, 10, 12, 16, 20, 26, 39, 52];

/** Une série mérite un mot à certains paliers seulement (3, 5, 7, 10, 14… jours ; 2, 3, 4, 6… semaines). */
export function isStreakMilestone({ count, unit }: { count: number; unit: 'jour' | 'semaine' }): boolean {
  return (unit === 'jour' ? DAY_MILESTONES : WEEK_MILESTONES).includes(count);
}

/** Le suivi de la journée bouclée : tâches du jour restantes au dernier passage, et fin à confirmer. */
export type ClosureState = { previous: number | null; pending: boolean };

/**
 * Journée bouclée : il restait des tâches pour aujourd'hui, il n'en reste plus, et au moins une a été
 * faite aujourd'hui. Les deux listes ne se relisent pas forcément ensemble : la fin reste « à confirmer »
 * jusqu'à ce que la tâche terminée apparaisse dans celles du jour.
 */
export function closureStep(state: ClosureState, open: number, doneToday: number): { state: ClosureState; celebrate: boolean } {
  let pending = state.pending;
  if (state.previous !== null && state.previous > 0 && open === 0) pending = true;
  if (open > 0) pending = false;
  if (pending && doneToday > 0) return { state: { previous: open, pending: false }, celebrate: true };
  return { state: { previous: open, pending }, celebrate: false };
}

/** Les objectifs atteints depuis la dernière fois (par leur identifiant). */
export function newlyAchieved(previous: Set<string> | null, achieved: Set<string>): string[] {
  if (previous === null) return [];
  return [...achieved].filter((id) => !previous.has(id));
}
