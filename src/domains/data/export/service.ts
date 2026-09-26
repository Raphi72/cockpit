import type { Db } from '@/core/db';
import {
  EXPORT_TABLES,
  buildDataExport,
  paymentsCsv,
  transactionsCsv,
  type ExportKind,
  type ExportTableKey,
} from './model';
import { getSchemaVersion, listPaymentsForExport, listTransactionsForExport, readTable } from './repository';

/** Contenu du fichier d'export, prêt à être enregistré. */
export async function buildExport(db: Db, kind: ExportKind, now: string): Promise<string> {
  if (kind === 'transactions') return transactionsCsv(await listTransactionsForExport(db));
  if (kind === 'payments') return paymentsCsv(await listPaymentsForExport(db));

  const tables = {} as Record<ExportTableKey, Record<string, unknown>[]>;
  for (const { table, key } of EXPORT_TABLES) tables[key] = await readTable(db, table);
  return buildDataExport({ schemaVersion: await getSchemaVersion(db), exportedAt: now, tables });
}
