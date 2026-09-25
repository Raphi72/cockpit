import { format, isToday } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Informations renvoyées par la commande Rust `app_info`. */
export type AppInfo = {
  dbPath: string;
  /** Dossier où partent les sauvegardes en ce moment. */
  backupDir: string;
  /** Dossier choisi dans Paramètres ; absent : le dossier par défaut, dans AppData. */
  chosenBackupDir: string | null;
  /** Le dossier choisi est injoignable (disque débranché…) : les sauvegardes vont dans le dossier par défaut. */
  chosenBackupDirUnavailable: boolean;
  schemaVersion: number;
  /** Horodatage de la sauvegarde la plus récente, au format 'YYYY-MM-DD_HHMMSS'. */
  lastBackup: string | null;
};

/** Sauvegarde choisie pour une restauration, déjà vérifiée par la commande Rust `restore_pick`. */
export type RestoreCandidate = {
  fileName: string;
  /** Horodatage lu dans le nom d'une sauvegarde faite par Cockpit. */
  stamp: string | null;
  /** Dernière modification du fichier (ms depuis 1970), à défaut. */
  modifiedMs: number | null;
  schemaVersion: number;
  projects: number;
  tasks: number;
  transactions: number;
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

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/**
 * Ce que l'on s'apprête à restaurer, en une phrase :
 * « Sauvegarde du 21 sept. 2026 à 09:02 : 12 projets, 48 tâches et 30 transactions. »
 */
export function describeCandidate(candidate: RestoreCandidate): string {
  const date =
    (candidate.stamp && parseBackupStamp(candidate.stamp)) ??
    (candidate.modifiedMs !== null ? new Date(candidate.modifiedMs) : null);
  const when = date
    ? isToday(date)
      ? `Sauvegarde d'${formatBackupDate(date)}`
      : `Sauvegarde du ${formatBackupDate(date)}`
    : candidate.fileName;
  const content = [plural(candidate.projects, 'projet'), plural(candidate.tasks, 'tâche')];
  return `${when} : ${content.join(', ')} et ${plural(candidate.transactions, 'transaction')}.`;
}
