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

/** Un Pomodoro en cours : travail ou pause, jusqu'à `endsAt` (millisecondes), et le numéro du tour. */
export type Pomodoro = { phase: 'work' | 'break'; endsAt: number; round: number };

export function startPomodoro(now: number, workMin: number): Pomodoro {
  return { phase: 'work', endsAt: now + workMin * 60_000, round: 1 };
}

/** La phase suivante : après le travail, la pause ; après la pause, un nouveau tour. */
export function nextPhase(pomodoro: Pomodoro, now: number, workMin: number, breakMin: number): Pomodoro {
  return pomodoro.phase === 'work'
    ? { phase: 'break', endsAt: now + breakMin * 60_000, round: pomodoro.round }
    : { phase: 'work', endsAt: now + workMin * 60_000, round: pomodoro.round + 1 };
}

/** « 24:59 », « 1:02:03 » : le temps qui reste, arrondi à la seconde supérieure. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
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
