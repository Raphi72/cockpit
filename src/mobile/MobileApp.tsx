import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { createQueryClient } from '@/app/query-client';
import { MotionProvider } from '@/ui/motion/MotionProvider';
import { mobileRouter } from './router';

const queryClient = createQueryClient();

/**
 * L'appli du téléphone (V2, étape 10) : les mêmes domaines que sur le PC, des écrans à part (src/mobile).
 * Aujourd'hui à l'ouverture, tâches et devoirs ensemble ; on y coche, marque un bloc fait et
 * retouche une page. Le reste se gère sur le PC.
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
