import { format, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Informations renvoyées par la commande Rust `app_info`. */
export type AppInfo = {
  dbPath: string;
  backupDir: string;
  schemaVersion: number;
  /** Horodatage de la sauvegarde la plus récente, au format 'YYYY-MM-DD_HHMMSS'. */
  lastBackup: string | null;
};

/** Les noms de fichiers de sauvegarde portent leur horodatage local : cockpit_2026-09-24_101500_auto.db */
export function parseBackupStamp(stamp: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!match) return null;
  type Parts = [number, number, number, number, number, number];
  const [y, mo, d, h, mi, s] = match.slice(1).map(Number) as Parts;
  return new Date(y, mo - 1, d, h, mi, s);
}

/** « aujourd'hui à 10:15 » ou « 21 sept. 2026 à 09:02 » */
export function formatBackupDate(date: Date): string {
  const time = format(date, 'HH:mm');
  if (isToday(date)) return `aujourd'hui à ${time}`;
  return `${format(date, 'd MMM yyyy', { locale: fr })} à ${time}`;
}
