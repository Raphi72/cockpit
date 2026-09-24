import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { humanizeError } from '@/core/db/errors';
import { toast } from '@/ui/overlays/toast';
import { router } from './router';

/**
 * Les données ne changent que par nos propres mutations, qui invalident leurs clés :
 * inutile de recharger en arrière-plan ou au retour sur la fenêtre.
 * Toute écriture qui échoue est signalée, jamais silencieuse.
 */
const queryClient = new QueryClient({
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
