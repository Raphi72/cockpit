import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { queryKeys } from '@/core/query-keys';
import { getFinanceSummary } from './repository';

export function useFinanceSummary(today: string) {
  return useQuery({ queryKey: queryKeys.finance.summary(today), queryFn: () => getFinanceSummary(db, today) });
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
