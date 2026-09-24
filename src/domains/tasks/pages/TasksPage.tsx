import { SquareCheck } from 'lucide-react';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';

export function TasksPage() {
  return (
    <Page title="Tâches">
      <EmptyState icon={SquareCheck} title="Aucune tâche pour l'instant">
        Les tâches (liées à un projet ou libres) et leurs vues arrivent au jalon 2.
      </EmptyState>
    </Page>
  );
}
