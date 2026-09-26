import { PAYMENT_STATUS_LABELS, type PaymentStatus } from '@/domains/finance/payments/model';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from '@/domains/finance/transactions/model';

// ─── Fichiers ───────────────────────────────────────────────────────────────

export type ExportKind = 'data' | 'transactions' | 'payments';

const EXPORT_FILES: Record<ExportKind, { name: string; extension: 'json' | 'csv'; mime: string }> = {
  data: { name: 'donnees', extension: 'json', mime: 'application/json' },
  transactions: { name: 'transactions', extension: 'csv', mime: 'text/csv' },
  payments: { name: 'encaissements', extension: 'csv', mime: 'text/csv' },
};

/**
 * « cockpit-export-transactions-2026-09-26.csv ». Tout export commence par `cockpit-export-` :
 * ce motif est ignoré par Git, et la commande native refuse tout autre nom.
 */
export function exportFileName(kind: ExportKind, today: string): string {
  const file = EXPORT_FILES[kind];
  return `cockpit-export-${file.name}-${today}.${file.extension}`;
}

export function exportMimeType(kind: ExportKind): string {
  return EXPORT_FILES[kind].mime;
}

// ─── JSON : toutes les données ──────────────────────────────────────────────

/**
 * Tables exportées, dans un ordre où chaque ligne ne renvoie qu'à des tables déjà lues (types avant
 * projets, projets avant tâches…). Ni les réglages, ni le journal des notifications, ni l'index de
 * recherche : ce ne sont pas des données saisies.
 */
export const EXPORT_TABLES = [
  { table: 'project_types', key: 'projectTypes' },
  { table: 'transaction_categories', key: 'transactionCategories' },
  { table: 'accounts', key: 'accounts' },
  { table: 'clients', key: 'clients' },
  { table: 'projects', key: 'projects' },
  { table: 'tasks', key: 'tasks' },
  { table: 'ideas', key: 'ideas' },
  { table: 'events', key: 'events' },
  { table: 'payments', key: 'payments' },
  { table: 'transactions', key: 'transactions' },
] as const;

export type ExportTableKey = (typeof EXPORT_TABLES)[number]['key'];

/** Version du format de ce fichier (pas du schéma SQL) : à augmenter si sa structure change. */
export const DATA_EXPORT_FORMAT = 1;

export type DataExport = {
  application: 'Cockpit';
  format: number;
  schemaVersion: number;
  exportedAt: string;
  conventions: string;
  tables: Record<ExportTableKey, Record<string, unknown>[]>;
};

export function buildDataExport(input: {
  schemaVersion: number;
  exportedAt: string;
  tables: Record<ExportTableKey, Record<string, unknown>[]>;
}): string {
  const content: DataExport = {
    application: 'Cockpit',
    format: DATA_EXPORT_FORMAT,
    schemaVersion: input.schemaVersion,
    exportedAt: input.exportedAt,
    conventions:
      'Montants en centimes, dates AAAA-MM-JJ, dates-heures locales AAAA-MM-JJTHH:MM, horodatages en UTC. ' +
      'Les valeurs calculées (soldes, progression, retards) ne sont pas stockées : elles se déduisent des lignes.',
    tables: input.tables,
  };
  return `${JSON.stringify(content, null, 2)}\n`;
}

// ─── CSV : pour Excel ───────────────────────────────────────────────────────

/**
 * Excel (réglages français) ouvre directement un CSV séparé par des points-virgules, encodé en UTF-8
 * avec BOM (sinon les accents sont abîmés), aux lignes terminées par CRLF.
 */
const CSV_SEPARATOR = ';';
const BOM = '﻿';

/** Une valeur : entre guillemets si elle contient un séparateur, un guillemet ou un retour à la ligne. */
export function csvField(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(CSV_SEPARATOR));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Nombre lu comme tel par Excel : virgule décimale, sans espace ni symbole. 123456 → « 1234,56 », −3500 → « -35,00 ». */
export function csvAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Date lue comme telle par Excel : « 26/09/2026 ». Vide si absente. */
export function csvDate(iso: string | null): string {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const text = (value: string | null) => value ?? '';

export type TransactionExportRow = {
  date: string;
  accountName: string;
  kind: TransactionKind;
  label: string;
  categoryName: string | null;
  projectName: string | null;
  amountCents: number;
  notes: string | null;
};

/**
 * Une ligne par mouvement sur un compte : un virement en a deux (sortie et entrée). Le montant est
 * signé, comme dans Cockpit : la somme d'un compte donne son solde.
 */
export function transactionsCsv(rows: TransactionExportRow[]): string {
  return toCsv(
    ['Date', 'Compte', 'Type', 'Libellé', 'Catégorie', 'Projet', 'Montant (€)', 'Notes'],
    rows.map((row) => [
      csvDate(row.date),
      row.accountName,
      TRANSACTION_KIND_LABELS[row.kind],
      row.label,
      text(row.categoryName),
      text(row.projectName),
      csvAmount(row.amountCents),
      text(row.notes),
    ]),
  );
}

export type PaymentExportRow = {
  label: string;
  projectName: string | null;
  clientName: string | null;
  amountCents: number;
  dueDate: string | null;
  status: PaymentStatus;
  receivedDate: string | null;
  invoiceRef: string | null;
  /** Le projet est encore une proposition : cet argent n'est pas attendu. */
  proposal: boolean;
  notes: string | null;
};

export function paymentsCsv(rows: PaymentExportRow[]): string {
  return toCsv(
    ['Libellé', 'Projet', 'Client', 'Montant (€)', 'Date prévue', 'Statut', 'Reçu le', 'N° de facture', 'Notes'],
    rows.map((row) => [
      row.label,
      text(row.projectName),
      text(row.clientName),
      csvAmount(row.amountCents),
      csvDate(row.dueDate),
      row.proposal && row.status !== 'received'
        ? `${PAYMENT_STATUS_LABELS[row.status]} (proposition)`
        : PAYMENT_STATUS_LABELS[row.status],
      csvDate(row.receivedDate),
      text(row.invoiceRef),
      text(row.notes),
    ]),
  );
}
