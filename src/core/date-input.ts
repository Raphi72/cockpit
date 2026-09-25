import { addMonths, addWeeks, differenceInCalendarDays, parseISO } from 'date-fns';
import { addDaysISO, isISODate, toISODate } from './dates';

/**
 * Date tapée au clavier dans le sélecteur de date, en français :
 * « auj. », « demain », « après-demain », « hier », « +3j », « +2s », « +1m », « dans 5 jours », « lundi »,
 * « 25 », « 25/10 », « 25/10/2026 », « 25 oct. », « 1er novembre 2027 », « 2026-10-25 ».
 *
 * Renvoie la date 'YYYY-MM-DD', `null` pour un champ vidé, ou `undefined` si le texte n'est pas compris.
 * Sans année (ou sans mois), c'est la date la plus proche d'aujourd'hui qui est retenue :
 * le 25 septembre, « 3 » donne le 3 octobre et « 20 » le 20 septembre.
 */
export function parseDateInput(text: string, today: string): string | null | undefined {
  const input = normalize(text);
  if (input === '') return null;

  if (['auj', 'aujourdhui', "aujourd'hui", 'ajd', 'today'].includes(input)) return today;
  if (['demain', 'dem', 'dmn'].includes(input)) return addDaysISO(today, 1);
  if (['apres-demain', 'apres demain', 'apresdemain'].includes(input)) return addDaysISO(today, 2);
  if (input === 'hier') return addDaysISO(today, -1);

  // « +3 », « +3j », « 2 sem », « dans 5 jours » : un signe ou une unité (sinon, « 25 » est un jour du mois).
  const offset = /^([+-]?)\s*(\d{1,3})\s*(j|jr|jrs|jour|jours|s|sem|semaine|semaines|m|mois)?$/.exec(
    input.replace(/^dans\s+/, '+'),
  );
  if (offset && (offset[1] !== '' || offset[3] !== undefined)) {
    const amount = Number(offset[2]) * (offset[1] === '-' ? -1 : 1);
    const unit = offset[3] ?? 'j';
    if (unit.startsWith('s')) return toISODate(addWeeks(parseISO(today), amount));
    if (unit.startsWith('m')) return toISODate(addMonths(parseISO(today), amount));
    return addDaysISO(today, amount);
  }

  const weekday = weekdayOf(input.replace(/\s*prochaine?$/, '').replace(/^prochaine?\s*/, ''));
  if (weekday !== undefined) {
    // Toujours à venir : « lundi », un lundi, c'est le lundi suivant.
    const current = parseISO(today).getDay();
    return addDaysISO(today, ((weekday - current + 7) % 7) || 7);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return isISODate(input) ? input : undefined;

  const numeric = /^(\d{1,2})(?:\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?)?$/.exec(input);
  if (numeric) return resolve(today, Number(numeric[1]), numeric[2] ? Number(numeric[2]) : null, numeric[3] ?? null);

  const named = /^(\d{1,2})(?:er)?\s*([a-z]+)\.?(?:\s+(\d{2}|\d{4}))?$/.exec(input);
  if (named) {
    const month = monthOf(named[2]!);
    return month === undefined ? undefined : resolve(today, Number(named[1]), month, named[3] ?? null);
  }
  return undefined;
}

/** Minuscules, sans accents ni point final, apostrophes droites, espaces simples. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

const WEEKDAYS: [string, number][] = [
  ['lundi', 1],
  ['lun', 1],
  ['mardi', 2],
  ['mar', 2],
  ['mercredi', 3],
  ['mer', 3],
  ['jeudi', 4],
  ['jeu', 4],
  ['vendredi', 5],
  ['ven', 5],
  ['samedi', 6],
  ['sam', 6],
  ['dimanche', 0],
  ['dim', 0],
];

function weekdayOf(word: string): number | undefined {
  return WEEKDAYS.find(([name]) => name === word)?.[1];
}

/** Débuts de mois reconnus, du plus long au plus court (« mars » avant « mar »). */
const MONTHS: [string, number][] = [
  ['janv', 1],
  ['jan', 1],
  ['fevr', 2],
  ['fev', 2],
  ['mars', 3],
  ['mar', 3],
  ['avr', 4],
  ['mai', 5],
  ['juin', 6],
  ['juil', 7],
  ['aout', 8],
  ['aou', 8],
  ['sept', 9],
  ['sep', 9],
  ['oct', 10],
  ['nov', 11],
  ['dec', 12],
];

function monthOf(word: string): number | undefined {
  return MONTHS.find(([prefix]) => word.startsWith(prefix))?.[1];
}

/** Jour réel, ou `undefined` (31 février…). */
function isoOf(year: number, month: number, day: number): string | undefined {
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isISODate(iso) ? iso : undefined;
}

/** Parmi les dates possibles, la plus proche d'aujourd'hui. */
function closest(today: string, candidates: (string | undefined)[]): string | undefined {
  const distance = (iso: string) => Math.abs(differenceInCalendarDays(parseISO(iso), parseISO(today)));
  return candidates
    .filter((iso): iso is string => iso !== undefined)
    .sort((a, b) => distance(a) - distance(b))[0];
}

function resolve(today: string, day: number, month: number | null, yearText: string | null): string | undefined {
  if (day < 1 || day > 31 || (month !== null && (month < 1 || month > 12))) return undefined;
  const year = Number(today.slice(0, 4));
  if (month === null) {
    // Un jour seul : ce mois-ci, le précédent ou le suivant.
    const current = Number(today.slice(5, 7));
    return closest(
      today,
      [-1, 0, 1].map((delta) => {
        const total = year * 12 + (current - 1) + delta;
        return isoOf(Math.floor(total / 12), (total % 12) + 1, day);
      }),
    );
  }
  if (yearText !== null) return isoOf(yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText), month, day);
  return closest(today, [year - 1, year, year + 1].map((y) => isoOf(y, month, day)));
}
