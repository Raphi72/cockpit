import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';

export function CalendarPage() {
  return (
    <Page title="Calendrier">
      <EmptyState icon={CalendarDays} title="Calendrier vide">
        Les vues mois, semaine et jour arrivent au jalon 4, avec tes deadlines, rendez-vous et
        paiements attendus au même endroit.
      </EmptyState>
    </Page>
  );
}
