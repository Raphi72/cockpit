import { MutationCache, QueryClient } from '@tanstack/react-query';
import { humanizeError } from '@/core/db/errors';
import { toast } from '@/ui/overlays/toast';

/**
 * Les données ne changent que par nos propres mutations, qui invalident leurs clés :
 * inutile de recharger en arrière-plan ou au retour sur la fenêtre.
 * Toute écriture qui échoue est signalée, jamais silencieuse. Le même réglage sur le PC et le téléphone.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => toast(humanizeError(error), { tone: 'danger' }),
    }),
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });
}
