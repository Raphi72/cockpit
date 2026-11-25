import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { daysBetween, formatShortDate, toISODate } from '@/core/dates';

/**
 * Capture de la boîte de réception : un texte noté vite, sans date ni projet. On la trie plus tard :
 * elle devient une tâche, une idée de projet ou un événement, et quitte alors la boîte.
 */
export type InboxItem = {
  id: string;
  text: string;
  /** Moment de la capture (horodatage UTC). */
  createdAt: string;
};

/** Texte enregistré : sur une seule ligne, sans espaces en trop ; `null` s'il est vide. */
export function cleanInboxText(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned === '' ? null : cleaned;
}

/**
 * Depuis quand une capture attend : « à l’instant », « il y a 12 min », « il y a 2 h », « hier »,
 * « lun. » (dans la semaine), puis une date courte.
 */
export function capturedLabel(createdAt: string, now: Date): string {
  const captured = new Date(createdAt);
  if (Number.isNaN(captured.getTime())) return '';
  const today = toISODate(now);
  const day = toISODate(captured);
  const days = daysBetween(day, today);
  if (days <= 0) {
    const minutes = Math.floor((now.getTime() - captured.getTime()) / 60_000);
    if (minutes < 1) return 'à l’instant';
    if (minutes < 60) return `il y a ${minutes} min`;
    return `il y a ${Math.floor(minutes / 60)} h`;
  }
  if (days === 1) return 'hier';
  if (days < 7) return format(captured, 'EEE', { locale: fr });
  return formatShortDate(day, today);
}

/** « 1 à trier », « 3 à trier » ; rien quand la boîte est vide. */
export function inboxCountLabel(count: number): string | null {
  return count > 0 ? `${count} à trier` : null;
}
