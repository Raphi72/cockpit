import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { daysBetween, isISODate } from './dates';

/**
 * Urgence d'une deadline, la même partout (lignes, fiches, dashboard) :
 * dépassée ou aujourd'hui (rouge), dans 1 à 3 jours (ambre), dans 4 à 7 jours (bleu),
 * plus tard (neutre), ou terminée (vert).
 */
export type DeadlineTone = 'late' | 'today' | 'soon' | 'week' | 'later' | 'done';

export type DeadlineStatus = { text: string; tone: DeadlineTone };

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** « 12 octobre », avec l'année si elle diffère ; « 12 oct. » en version courte. */
function dayText(day: string, today: string, short: boolean): string {
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  const pattern = short ? (sameYear ? 'd MMM' : 'd MMM yyyy') : sameYear ? 'd MMMM' : 'd MMMM yyyy';
  return format(parseISO(day), pattern, { locale: fr });
}

/**
 * Jour relatif, pour une date à venir ou passée : « Aujourd'hui », « Demain », « Hier »,
 * « Dans 6 jours », « Il y a 3 jours » (jusqu'à une semaine), puis la date.
 * `short` : « Dans 6 j », « 12 oct. », pour les colonnes étroites.
 */
export function relativeDayText(day: string, today: string, short = false): string {
  if (!isISODate(day)) return day;
  const diff = daysBetween(today, day);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  if (diff > 1 && diff <= 7) return short ? `Dans ${diff} j` : `Dans ${diff} jours`;
  if (diff < -1 && diff >= -7) return short ? `Il y a ${-diff} j` : `Il y a ${-diff} jours`;
  return dayText(day, today, short);
}

/**
 * Texte et couleur d'une deadline : « En retard de 3 jours », « Aujourd'hui », « Demain »,
 * « Dans 3 jours », « Dans 6 jours », « 12 octobre », ou « Terminée ».
 */
export function deadlineStatus(
  deadline: string,
  today: string,
  options: { done?: boolean; short?: boolean } = {},
): DeadlineStatus {
  const { done = false, short = false } = options;
  if (done) return { text: 'Terminée', tone: 'done' };
  const diff = daysBetween(today, deadline);
  if (diff < 0) return { text: short ? `${-diff} j de retard` : `En retard de ${plural(-diff, 'jour')}`, tone: 'late' };
  const text = relativeDayText(deadline, today, short);
  if (diff === 0) return { text, tone: 'today' };
  if (diff <= 3) return { text, tone: 'soon' };
  if (diff <= 7) return { text, tone: 'week' };
  return { text, tone: 'later' };
}
