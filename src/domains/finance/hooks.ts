import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { queryKeys } from '@/core/query-keys';
import { buildYearRevenue } from './model';
import { getFinanceSummary, getFirstRevenueYear, listRevenueByMonth } from './repository';

export function useFinanceSummary(today: string) {
  return useQuery({ queryKey: queryKeys.finance.summary(today), queryFn: () => getFinanceSummary(db, today) });
}

/** Chiffre d'affaires d'une année, par trimestre et par mois (onglet « Chiffre d'affaires »). */
export function useYearRevenue(year: number) {
  return useQuery({
    queryKey: [...queryKeys.finance.all, 'revenue', year],
    queryFn: async () => buildYearRevenue(year, await listRevenueByMonth(db, year)),
  });
}

/** Première année qui a des encaissements reçus : on ne remonte pas plus loin. */
export function useFirstRevenueYear() {
  return useQuery({ queryKey: [...queryKeys.finance.all, 'revenue', 'first-year'], queryFn: () => getFirstRevenueYear(db) });
}

/**
 * Tout mouvement d'argent touche plusieurs vues : soldes, encaissements, transactions,
 * montants reçus des projets, « à recevoir » des clients et échéances du calendrier.
 */
export function invalidateMoney(queryClient: QueryClient): void {
  for (const queryKey of [
    queryKeys.finance.all,
    queryKeys.payments.all,
    queryKeys.transactions.all,
    queryKeys.projects.all,
    queryKeys.clients.all,
    queryKeys.agenda.all,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function useInvalidateMoney(): () => void {
  const queryClient = useQueryClient();
  return () => invalidateMoney(queryClient);
}
