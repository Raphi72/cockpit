import { ChartGantt } from 'lucide-react';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';

export function PlanningPage() {
  return (
    <Page title="Planning">
      <EmptyState icon={ChartGantt} title="Pas encore de planning">
        La timeline de tes projets, pour voir d'un coup d'œil ce qui se chevauche, arrive en
        version 1.1.
      </EmptyState>
    </Page>
  );
}
