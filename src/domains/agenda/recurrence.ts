import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addDaysISO, daysBetween, formatShortDate, isISODate } from '@/core/dates';

/**
 * Événements récurrents (P15). La règle est stockée une fois, au format RRULE (RFC 5545) ; les
 * occurrences sont calculées ici, jamais recopiées. Seul le sous-ensemble que l'interface sait saisir
 * est compris : chaque jour, semaine, mois ou année, toutes les N périodes, certains jours de la
 * semaine, jusqu'à une date. Les dates sont des jours locaux ('YYYY-MM-DD') : aucun fuseau horaire.
 */

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type Recurrence = {
  freq: RecurrenceFreq;
  /** Toutes les `interval` périodes : 1 pour chaque semaine, 2 pour une semaine sur deux… */
  interval: number;
  /**
   * Hebdomadaire seulement : les jours de la semaine (0 = dimanche … 6 = samedi), du lundi au
   * dimanche. Celui du premier jour en fait toujours partie.
   */
  weekdays: number[];
  /** Dernier jour où l'événement peut avoir lieu, inclus ; `null` : sans fin. */
  until: string | null;
};

// ─── Format RRULE ───────────────────────────────────────────────────────────

const FREQ_CODES: Record<RecurrenceFreq, string> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };

/** Codes RFC des jours, dans l'ordre de `Date.getDay()` (0 = dimanche). */
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Du lundi au dimanche : l'ordre des semaines de la norme (et de l'affichage). */
const mondayFirst = (a: number, b: number) => ((a + 6) % 7) - ((b + 6) % 7);

/** « FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20270630 » */
export function formatRecurrence(rule: Recurrence): string {
  const parts = [`FREQ=${FREQ_CODES[rule.freq]}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'weekly' && rule.weekdays.length > 0) {
    parts.push(`BYDAY=${[...rule.weekdays].sort(mondayFirst).map((day) => DAY_CODES[day]).join(',')}`);
  }
  if (rule.until) parts.push(`UNTIL=${rule.until.replaceAll('-', '')}`);
  return parts.join(';');
}

/**
 * Lit une règle. `null` si elle est absente, ou si elle sort de ce que Cockpit comprend (COUNT,
 * BYMONTHDAY, « le 2e mardi »…) : plutôt aucune répétition qu'une répétition fausse.
 */
export function parseRecurrence(text: string | null | undefined): Recurrence | null {
  if (!text) return null;
  const rule: Recurrence = { freq: 'daily', interval: 1, weekdays: [], until: null };
  let hasFreq = false;
  for (const part of text.replace(/^RRULE:/i, '').split(';')) {
    const [key, value = ''] = part.split('=');
    switch (key?.toUpperCase()) {
      case 'FREQ': {
        const freq = (Object.keys(FREQ_CODES) as RecurrenceFreq[]).find((f) => FREQ_CODES[f] === value.toUpperCase());
        if (!freq) return null;
        rule.freq = freq;
        hasFreq = true;
        break;
      }
      case 'INTERVAL': {
        const interval = Number(value);
        if (!Number.isInteger(interval) || interval < 1) return null;
        rule.interval = interval;
        break;
      }
      case 'BYDAY': {
        const days = value.split(',').map((code) => DAY_CODES.indexOf(code.toUpperCase()));
        if (days.includes(-1)) return null;
        rule.weekdays = [...new Set(days)].sort(mondayFirst);
        break;
      }
      case 'UNTIL': {
        const until = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
        if (!isISODate(until)) return null;
        rule.until = until;
        break;
      }
      // Lundi : la valeur par défaut de la norme, la seule que Cockpit applique.
      case 'WKST':
        if (value.toUpperCase() !== 'MO') return null;
        break;
      default:
        return null;
    }
  }
  if (!hasFreq || (rule.freq !== 'weekly' && rule.weekdays.length > 0)) return null;
  return rule;
}

// ─── Jours d'une série ──────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Numéro du jour depuis le 1er janvier 1970 : des différences de jours sans fuseau ni heure d'été. */
function dayNumber(day: string): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS;
}

/** Jour de la semaine (0 = dimanche … 6 = samedi). Le 1er janvier 1970 était un jeudi. */
export function weekdayOf(day: string): number {
  return (((dayNumber(day) + 4) % 7) + 7) % 7;
}

/** Numéro de la semaine, du lundi au dimanche : deux jours de la même semaine ont le même. */
const weekNumber = (day: string) => Math.floor((dayNumber(day) + 3) / 7);

const monthNumber = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));

/**
 * Vrai si `day` est un jour de la série qui commence le `start`. Un mois sans le quantième voulu
 * (le 31 en avril, le 29 février) est simplement sauté, comme le veut la norme.
 */
export function isOccurrenceDay(start: string, rule: Recurrence, day: string): boolean {
  if (day < start || (rule.until !== null && day > rule.until)) return false;
  switch (rule.freq) {
    case 'daily':
      return (dayNumber(day) - dayNumber(start)) % rule.interval === 0;
    case 'weekly': {
      const weekdays = rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(start)];
      return weekdays.includes(weekdayOf(day)) && (weekNumber(day) - weekNumber(start)) % rule.interval === 0;
    }
    case 'monthly':
      return day.slice(8) === start.slice(8) && (monthNumber(day) - monthNumber(start)) % rule.interval === 0;
    case 'yearly':
      return day.slice(5) === start.slice(5) && (Number(day.slice(0, 4)) - Number(start.slice(0, 4))) % rule.interval === 0;
  }
}

/** Jours de la série dans [from, to[, dans l'ordre. */
export function occurrenceDays(start: string, rule: Recurrence, from: string, to: string): string[] {
  const days: string[] = [];
  const last = rule.until !== null && rule.until < to ? addDaysISO(rule.until, 1) : to;
  for (let day = from > start ? from : start; day < last; day = addDaysISO(day, 1)) {
    if (isOccurrenceDay(start, rule, day)) days.push(day);
  }
  return days;
}

// ─── Occurrences d'un événement ─────────────────────────────────────────────

/** Ce qui est stocké pour une occurrence qui ne suit pas la règle (table `event_exceptions`). */
export type EventException = {
  eventId: string;
  /** Jour prévu par la règle : il désigne l'occurrence. */
  occurrence: string;
  kind: 'cancelled' | 'moved';
  /** Déplacée : son nouveau moment, au format de `events.starts_at`. */
  startsAt: string | null;
  endsAt: string | null;
};

export type Occurrence = {
  /** Jour prévu par la règle, même si l'occurrence a été déplacée. */
  day: string;
  /** 'YYYY-MM-DD' pour une journée entière, sinon 'YYYY-MM-DDTHH:MM'. */
  startsAt: string;
  endsAt: string | null;
};

/** Le moment d'un événement, et sa règle : ce qu'il faut pour calculer ses occurrences. */
export type Series = { startsAt: string; endsAt: string | null; recurrence: string | null };

/** 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:MM' décalé de `days` jours, l'heure gardée. */
function shiftStamp(stamp: string, days: number): string {
  return addDaysISO(stamp.slice(0, 10), days) + stamp.slice(10);
}

/** Même comparaison de texte que la requête de l'agenda : 'YYYY-MM-DDTHH:MM' se trie après 'YYYY-MM-DD'. */
const touches = (startsAt: string, endsAt: string | null, from: string, to: string) =>
  startsAt < to && (endsAt ?? startsAt) >= from;

/**
 * Occurrences d'un événement qui touchent [from, to[, dans l'ordre : celles de sa règle, sans les
 * annulées, et les déplacées à leur nouvelle place. Chacune dure autant que la première.
 * Un événement sans règle n'a qu'une occurrence : lui-même.
 */
export function expandSeries(series: Series, exceptions: EventException[], from: string, to: string): Occurrence[] {
  const start = series.startsAt.slice(0, 10);
  const rule = parseRecurrence(series.recurrence);
  if (!rule) {
    return touches(series.startsAt, series.endsAt, from, to)
      ? [{ day: start, startsAt: series.startsAt, endsAt: series.endsAt }]
      : [];
  }

  const span = series.endsAt ? Math.max(daysBetween(start, series.endsAt.slice(0, 10)), 0) : 0;
  const exceptionOf = new Map(exceptions.map((exception) => [exception.occurrence, exception]));
  const occurrences: Occurrence[] = [];

  // Une occurrence commencée avant la plage peut encore la toucher : on remonte de sa durée.
  for (const day of occurrenceDays(start, rule, addDaysISO(from, -span), to)) {
    if (exceptionOf.has(day)) continue;
    const delta = daysBetween(start, day);
    const startsAt = shiftStamp(series.startsAt, delta);
    const endsAt = series.endsAt ? shiftStamp(series.endsAt, delta) : null;
    if (touches(startsAt, endsAt, from, to)) occurrences.push({ day, startsAt, endsAt });
  }
  for (const exception of exceptions) {
    // Une exception dont le jour n'est plus dans la règle (règle modifiée depuis) ne compte plus.
    if (exception.kind !== 'moved' || !exception.startsAt || !isOccurrenceDay(start, rule, exception.occurrence)) continue;
    if (touches(exception.startsAt, exception.endsAt, from, to)) {
      occurrences.push({ day: exception.occurrence, startsAt: exception.startsAt, endsAt: exception.endsAt });
    }
  }
  return occurrences.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Fenêtres de recherche de la prochaine occurrence, en jours : large d'abord pour le cas courant, puis jusqu'à 8 ans (29 février). */
const SEARCH_WINDOWS = [35, 400, 3000];

/** Première occurrence qui n'est pas finie avant `day` ; `null` si la série est terminée. */
export function nextOccurrence(series: Series, exceptions: EventException[], day: string): Occurrence | null {
  let from = day;
  for (const size of SEARCH_WINDOWS) {
    const to = addDaysISO(day, size);
    const found = expandSeries(series, exceptions, from, to).find((o) => (o.endsAt ?? o.startsAt).slice(0, 10) >= day);
    if (found) return found;
    from = to;
  }
  return null;
}

// ─── Saisie ─────────────────────────────────────────────────────────────────

/** Les choix tout faits du menu « Répéter ». */
export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export const REPEAT_PRESETS: RepeatPreset[] = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'];

export const REPEAT_PRESET_LABELS: Record<RepeatPreset, string> = {
  none: 'Jamais',
  daily: 'Chaque jour',
  weekly: 'Chaque semaine',
  biweekly: 'Toutes les 2 semaines',
  monthly: 'Chaque mois',
  yearly: 'Chaque année',
};

export function presetOf(rule: Recurrence | null): RepeatPreset {
  if (!rule) return 'none';
  return rule.freq === 'weekly' && rule.interval === 2 ? 'biweekly' : rule.freq;
}

/**
 * Choisir une répétition dans le menu. La fin déjà réglée est gardée ; les jours de la semaine
 * aussi, tant qu'on reste en hebdomadaire.
 */
export function applyPreset(preset: RepeatPreset, current: Recurrence | null, start: string): Recurrence | null {
  if (preset === 'none') return null;
  const until = current?.until ?? null;
  if (preset === 'weekly' || preset === 'biweekly') {
    const kept = current?.freq === 'weekly' ? current.weekdays : [];
    return normalizeRecurrence({ freq: 'weekly', interval: preset === 'biweekly' ? 2 : 1, weekdays: kept, until }, start);
  }
  return { freq: preset, interval: 1, weekdays: [], until };
}

/** Règle cohérente avec son premier jour : en hebdomadaire, son jour de la semaine en fait partie. */
export function normalizeRecurrence(rule: Recurrence, start: string): Recurrence {
  if (rule.freq !== 'weekly') return { ...rule, weekdays: [] };
  const weekdays = [...new Set([...rule.weekdays, weekdayOf(start)])].sort(mondayFirst);
  return { ...rule, weekdays };
}

/** Cocher ou décocher un jour de la semaine. Celui du premier jour reste toujours coché. */
export function toggleWeekday(rule: Recurrence, weekday: number, start: string): Recurrence {
  if (rule.freq !== 'weekly' || weekday === weekdayOf(start)) return rule;
  const weekdays = rule.weekdays.includes(weekday) ? rule.weekdays.filter((d) => d !== weekday) : [...rule.weekdays, weekday];
  return normalizeRecurrence({ ...rule, weekdays }, start);
}

/**
 * Le premier jour change : la règle suit. Un événement d'un seul jour par semaine change de jour ;
 * s'il en avait plusieurs, le nouveau s'y ajoute.
 */
export function moveRecurrenceStart(rule: Recurrence | null, start: string): Recurrence | null {
  if (!rule || rule.freq !== 'weekly') return rule;
  return normalizeRecurrence({ ...rule, weekdays: rule.weekdays.length <= 1 ? [] : rule.weekdays }, start);
}

/** Message d'erreur, ou `null` si la règle est cohérente avec le premier jour. */
export function validateRecurrence(rule: Recurrence | null, start: string): string | null {
  if (!rule) return null;
  if (rule.until !== null && !isISODate(rule.until)) return 'Date de fin de répétition invalide.';
  if (rule.until !== null && rule.until < start) return 'La répétition se termine avant le début.';
  return null;
}

// ─── Libellés ───────────────────────────────────────────────────────────────

/** Jours de la semaine, du lundi au dimanche (ou du dimanche au samedi) : la lettre de la pastille et le nom complet. */
export function weekdayChoices(weekStartsOn: 0 | 1 = 1): { weekday: number; letter: string; name: string }[] {
  const names = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return Array.from({ length: 7 }, (_, index) => (index + weekStartsOn) % 7).map((weekday) => ({
    weekday,
    letter: names[weekday]!.charAt(0).toUpperCase(),
    name: names[weekday]!,
  }));
}

/** « lundi », « lundi et mercredi », « lundi, mercredi et vendredi » */
function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/**
 * La règle en clair : « Chaque semaine, le lundi et le jeudi », « Toutes les 2 semaines, le mardi »,
 * « Chaque mois, le 30 », « Chaque année, le 30 novembre », avec « jusqu’au 30 juin 2027 » s'il y a une fin.
 */
export function recurrenceLabel(rule: Recurrence, start: string, today: string): string {
  const every = (one: string, many: (n: number) => string) => (rule.interval === 1 ? one : many(rule.interval));
  let text: string;
  switch (rule.freq) {
    case 'daily':
      text = every('Chaque jour', (n) => `Tous les ${n} jours`);
      break;
    case 'weekly': {
      const days = normalizeRecurrence(rule, start).weekdays.map((d) => weekdayChoices().find((c) => c.weekday === d)!.name);
      text = `${every('Chaque semaine', (n) => `Toutes les ${n} semaines`)}, le ${joinNames(days)}`;
      break;
    }
    case 'monthly':
      text = `${every('Chaque mois', (n) => `Tous les ${n} mois`)}, le ${Number(start.slice(8, 10))}`;
      break;
    case 'yearly':
      text = `${every('Chaque année', (n) => `Tous les ${n} ans`)}, le ${format(parseISO(start), 'd MMMM', { locale: fr })}`;
      break;
  }
  return rule.until ? `${text}, jusqu’au ${formatShortDate(rule.until, today)}` : text;
}
