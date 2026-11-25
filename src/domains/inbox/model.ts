import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { daysBetween, formatShortDate, toISODate } from '@/core/dates';
import type { SettingDef } from '@/domains/settings/model';

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

// ─── Capture rapide ─────────────────────────────────────────────────────────

/** Valeur du réglage quand le raccourci global est désactivé. */
export const NO_CAPTURE_SHORTCUT = 'none';

export type CaptureShortcutChoice = 'Ctrl+Shift+Space' | 'Alt+Shift+C' | 'Super+Alt+C' | typeof NO_CAPTURE_SHORTCUT;

/**
 * Raccourcis proposés pour la capture rapide. Les valeurs sont lues telles quelles côté natif
 * (src-tauri/src/capture.rs, qui vérifie qu'il les comprend). Pas de Ctrl+Alt : c'est AltGr sur un
 * clavier AZERTY. Espace et C sont à la même place en AZERTY et en QWERTY.
 */
export const CAPTURE_SHORTCUTS: { value: CaptureShortcutChoice; label: string }[] = [
  { value: 'Ctrl+Shift+Space', label: 'Ctrl Maj Espace' },
  { value: 'Alt+Shift+C', label: 'Alt Maj C' },
  { value: 'Super+Alt+C', label: 'Win Alt C' },
  { value: NO_CAPTURE_SHORTCUT, label: 'Aucun' },
];

/** Le raccourci global de capture, lu aussi côté natif au démarrage (même clé, même valeur par défaut). */
export const CAPTURE_SHORTCUT: SettingDef<CaptureShortcutChoice> = { key: 'capture.shortcut', fallback: 'Ctrl+Shift+Space' };

/** Une valeur inattendue en base (modifiée à la main…) retombe sur le raccourci par défaut. */
export function resolveCaptureShortcut(value: unknown): CaptureShortcutChoice {
  return CAPTURE_SHORTCUTS.find((choice) => choice.value === value)?.value ?? CAPTURE_SHORTCUT.fallback;
}

/** Ce que Windows fait vraiment du raccourci (commande native `capture_shortcut_get`). */
export type NativeCaptureShortcut = {
  /** Faux dans le navigateur de développement : pas de raccourci global. */
  available: boolean;
  /** Faux : désactivé, ou refusé parce qu'une autre application l'utilise déjà. */
  active: boolean;
};
