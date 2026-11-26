import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { MotionProvider } from '@/ui/motion/MotionProvider';
import { createQueryClient } from './query-client';
import { router } from './router';

const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <RouterProvider router={router} />
      </MotionProvider>
    </QueryClientProvider>
  );
}
