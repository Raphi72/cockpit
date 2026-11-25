import { isMonth } from '@/core/dates';
import { TRANSACTION_KINDS, type TransactionKind } from './transactions/model';

export type FinanceView = 'due' | 'late' | 'received' | 'transactions' | 'revenue';

export const FINANCE_VIEWS: FinanceView[] = ['due', 'late', 'received', 'transactions', 'revenue'];

export const FINANCE_VIEW_LABELS: Record<FinanceView, string> = {
  due: 'À recevoir',
  late: 'En retard',
  received: 'Reçus',
  transactions: 'Transactions',
  revenue: 'Chiffre d’affaires',
};

/**
 * Vue et filtres de la page Finances, gardés dans l'URL interne.
 * `month` absent : le mois en cours. `year` (chiffre d'affaires) absent : l'année en cours.
 */
export type FinancesSearch = {
  view?: Exclude<FinanceView, 'due'>;
  month?: string;
  account?: string;
  kind?: TransactionKind;
  category?: string;
  year?: number;
};

export function validateFinancesSearch(search: Record<string, unknown>): FinancesSearch {
  const view = FINANCE_VIEWS.find((v) => v === search.view);
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
  return {
    view: view && view !== 'due' ? view : undefined,
    month: isMonth(search.month) ? search.month : undefined,
    account: text(search.account),
    kind: TRANSACTION_KINDS.find((k) => k === search.kind),
    category: text(search.category),
    year: typeof search.year === 'number' && Number.isInteger(search.year) ? search.year : undefined,
  };
}
