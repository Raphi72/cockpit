import { EXPORT_TABLES } from '@/domains/data/export/model';

/**
 * Synchronisation entre appareils (V2, étape 9, P22). Chaque appareil garde sa base complète ; des
 * déclencheurs notent chaque ligne changée (`sync_rows`, migration 0014). Les lignes changées partent dans
 * des fichiers (chiffrés côté Rust, déposés dans le dossier caché de l'app sur Google Drive) ; ceux des autres
 * appareils sont appliqués : pour une même ligne, le changement le plus récent l'emporte.
 */

/** Les tables synchronisées : celles des données, comme l'export. Les réglages restent propres à chaque appareil. */
export const SYNC_TABLES: readonly string[] = EXPORT_TABLES.map((t) => t.table);

/** Version du format des fichiers de changements. */
export const SYNC_FORMAT = 1;

/** Un fichier de changements reste petit : au-delà, la suite part dans le suivant. */
export const MAX_FILE_BYTES = 3_000_000;

/** Toutes les minutes tant que Cockpit est ouvert, et quand sa fenêtre se ferme. */
export const SYNC_INTERVAL_MS = 60_000;

/** Une ligne changée : sa table, sa clé (tableau JSON), l'heure du changement, ses valeurs (`null` : supprimée). */
export type SyncRow = { t: string; k: string; at: string; d: Record<string, unknown> | null };

export type ChangeFile = { format: number; schema: number; device: string; seq: number; createdAt: string; rows: SyncRow[] };

/** Un fichier déposé par un appareil : `<appareil>-<numéro sur 12 chiffres>.ckp` (le natif ajoute un préfixe en développement). */
export function changeFileName(device: string, seq: number): string {
  return `${device}-${String(seq).padStart(12, '0')}.ckp`;
}

export function parseChangeFileName(name: string): { device: string; seq: number } | null {
  const match = /^(.+)-(\d{12})\.ckp$/.exec(name);
  return match ? { device: match[1]!, seq: Number(match[2]) } : null;
}

/** Les fichiers des autres appareils pas encore lus, dans l'ordre où ils ont été écrits. */
export function filesToRead(
  files: { id: string; name: string }[],
  ownDevice: string,
  cursors: Record<string, number>,
): { id: string; name: string; device: string; seq: number }[] {
  return files
    .flatMap((file) => {
      const parsed = parseChangeFileName(file.name);
      if (!parsed || parsed.device === ownDevice || parsed.seq <= (cursors[parsed.device] ?? 0)) return [];
      return [{ ...file, ...parsed }];
    })
    .sort((a, b) => a.device.localeCompare(b.device) || a.seq - b.seq);
}

/** Deux versions d'une même ligne : la plus récente l'emporte ; à égalité, l'appareil au plus grand identifiant. */
export function isNewer(a: { at: string; device: string }, b: { at: string; device: string }): boolean {
  return a.at > b.at || (a.at === b.at && a.device > b.device);
}

/**
 * Contraintes d'unicité des tables synchronisées (en plus de la clé) : si une ligne reçue en heurte une
 * locale, la locale cède (renommée, détachée ou retirée), et ce changement part aux autres appareils.
 */
export type UniqueRule = { table: string; columns: string[]; resolve: 'rename' | 'clear' | 'delete'; target?: string };

export const UNIQUE_RULES: UniqueRule[] = [
  { table: 'project_types', columns: ['name'], resolve: 'rename', target: 'name' },
  { table: 'transaction_categories', columns: ['name', 'kind'], resolve: 'rename', target: 'name' },
  { table: 'transactions', columns: ['payment_id'], resolve: 'clear', target: 'payment_id' },
  { table: 'event_exceptions', columns: ['event_id', 'occurrence'], resolve: 'delete' },
  { table: 'pages', columns: ['journal_date'], resolve: 'clear', target: 'journal_date' },
];

/** Titre de la copie gardée quand une page a été modifiée sur deux appareils à la fois. */
export function conflictTitle(title: string): string {
  return `${title.trim() || 'Sans titre'} (autre version)`;
}

/**
 * Code de la clé de chiffrement, tel que l'affiche le natif (13 groupes de 4) : nettoyé de ce qu'on a pu
 * taper en plus (espaces, tirets, minuscules). Vide s'il n'a pas la bonne longueur.
 */
export function normalizeKeyCode(input: string): string {
  const compact = input.toUpperCase().replace(/[\s-]/g, '');
  return compact.length === 52 ? compact : '';
}
