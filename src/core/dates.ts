import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Vrai pour une date réelle au format stocké 'YYYY-MM-DD' (année à 4 chiffres). */
export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
}

/** Date locale au format stocké en base : 'YYYY-MM-DD'. */
export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * « Aujourd'hui » est toujours passé explicitement aux règles métier et aux requêtes
 * (jamais `date('now')` en SQL), pour qu'elles restent testables.
 */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Horodatage technique (created_at, updated_at…) en UTC ISO. */
export function nowTimestamp(): string {
  return new Date().toISOString();
}

/** Nombre de jours calendaires de `from` à `to` (négatif si `to` est passé). */
export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/** « Jeudi 24 septembre » */
export function formatLongDate(date: Date): string {
  return capitalize(format(date, 'EEEE d MMMM', { locale: fr }));
}

/** « 10 oct. », ou « 10 oct. 2027 » si l'année diffère de celle de référence. */
export function formatShortDate(iso: string, today: string): string {
  if (!isISODate(iso)) return iso;
  const date = parseISO(iso);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return format(date, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: fr });
}

/** Date d'un champ : « ven. 25 sept. », ou « ven. 25 sept. 2027 » si l'année diffère. */
export function formatDateField(iso: string, today: string): string {
  if (!isISODate(iso)) return iso;
  return format(parseISO(iso), iso.slice(0, 4) === today.slice(0, 4) ? 'EEE d MMM' : 'EEE d MMM yyyy', { locale: fr });
}

/**
 * Moment où une tâche ou un projet a été terminé (horodatage UTC, affiché en heure locale) :
 * « aujourd'hui à 14:32 », « hier à 09:10 », « le 12 sept. à 18:00 ».
 */
export function formatCompletedAt(timestamp: string, today: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const day = toISODate(date);
  const time = format(date, 'HH:mm');
  const diff = daysBetween(today, day);
  if (diff === 0) return `aujourd’hui à ${time}`;
  if (diff === -1) return `hier à ${time}`;
  return `le ${formatShortDate(day, today)} à ${time}`;
}

/**
 * Date relative pour les listes : « aujourd'hui », « demain », « lundi » (dans la semaine),
 * « il y a 3 j », puis une date courte au-delà.
 */
export function relativeDateLabel(iso: string, today: string): string {
  if (!isISODate(iso)) return iso;
  const diff = daysBetween(today, iso);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'demain';
  if (diff === -1) return 'hier';
  if (diff > 1 && diff < 7) return format(parseISO(iso), 'EEEE', { locale: fr });
  if (diff < -1 && diff > -30) return `il y a ${-diff} j`;
  return formatShortDate(iso, today);
}

// ─── Mois ('YYYY-MM') ───────────────────────────────────────────────────────

/** Mois d'une date : '2026-09-24' → '2026-09'. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Bornes d'un mois pour une requête : du 1er inclus au 1er du mois suivant exclu. */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}

/** '2026-09' + 1 → '2026-10' ; '2026-01' − 1 → '2025-12'. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const total = year * 12 + (monthIndex - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** « Septembre », ou « Septembre 2025 » si l'année diffère de celle de référence. */
export function formatMonth(month: string, today: string): string {
  const date = parseISO(`${month}-01`);
  return capitalize(format(date, month.slice(0, 4) === today.slice(0, 4) ? 'MMMM' : 'MMMM yyyy', { locale: fr }));
}

/** Vrai pour un mois au format 'YYYY-MM'. */
export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Date décalée de `days` jours : '2026-09-24' + 30 → '2026-10-24'. */
export function addDaysISO(iso: string, days: number): string {
  return toISODate(addDays(parseISO(iso), days));
}

/** Lundi qui suit `iso` (celui de la semaine prochaine si `iso` est un lundi). */
export function nextMondayISO(iso: string): string {
  const weekday = parseISO(iso).getDay(); // 0 = dimanche … 6 = samedi
  return addDaysISO(iso, ((8 - weekday) % 7) || 7);
}

// ─── Heures ('HH:MM', heure locale) ─────────────────────────────────────────

/** Vrai pour une heure au format 'HH:MM', de 00:00 à 23:59. */
export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** '14:30' → 870 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** 870 → '14:30' */
export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
