import { GraduationCap } from 'lucide-react';
import { useToday } from '@/core/use-today';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { dashboardTitle } from '../model';

/** Aujourd’hui en mode Cours : la journée de cours. */
export function SchoolDashboard() {
  const today = useToday();
  return (
    <Page title={dashboardTitle(today, today)} subtitle="Rien de prévu pour l’instant.">
      <EmptyState icon={GraduationCap} title="Ton espace Cours">
        <p>Tes matières, ton emploi du temps et tes devoirs apparaîtront ici, jour après jour.</p>
      </EmptyState>
    </Page>
  );
}
