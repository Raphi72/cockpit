import { Wallet } from 'lucide-react';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';

export function FinancesPage() {
  return (
    <Page title="Finances">
      <EmptyState icon={Wallet} title="Tes comptes sont prêts">
        Soldes, encaissements et transactions arrivent au jalon 3.
      </EmptyState>
    </Page>
  );
}
