import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createQueryClient } from '@/app/query-client';
import { MotionProvider } from '@/ui/motion/MotionProvider';
import { mobileRouter } from './router';

const queryClient = createQueryClient();

/**
 * L'appli du téléphone (V2, étape 10) : les pages du PC sur une colonne (variante `phone:`), avec ses
 * propres onglets, son Agenda, ses Pages et ses Réglages (src/mobile). L'argent reste sur le PC.
 */
export function MobileApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <RouterProvider router={mobileRouter} />
      </MotionProvider>
    </QueryClientProvider>
  );
}
