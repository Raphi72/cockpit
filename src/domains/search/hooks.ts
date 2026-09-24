import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { db } from '@/core/db';
import { queryKeys } from '@/core/query-keys';
import { searchTerms } from './model';
import { searchEverything } from './repository';

/**
 * Résultats de la recherche globale. Les précédents restent affichés pendant la frappe (pas de clignement).
 * La recherche lit tous les domaines : elle est refaite à chaque ouverture de la palette plutôt qu'invalidée.
 */
export function useSearch(text: string, today: string) {
  const query = text.trim();
  return useQuery({
    queryKey: queryKeys.search(query, today),
    queryFn: () => searchEverything(db, query, today),
    enabled: searchTerms(query).length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 30_000,
  });
}
