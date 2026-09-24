import type { ReactNode } from 'react';
import { formatMonth, monthOf } from '@/core/dates';
import { formatMoney, formatSignedMoney } from '@/core/money';
import { InlineAmount } from '@/ui/primitives/InlineFields';
import { useCorrectBalance } from '../accounts/hooks';
import { UPCOMING_DAYS, type AccountFigure, type FinanceSummary } from '../model';

function Figure({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-meta text-ink-3">{label}</p>
      <div className="tnum mt-1 text-figure font-medium">{children}</div>
      {sub && <p className="tnum mt-1 truncate text-meta text-ink-3">{sub}</p>}
    </div>
  );
}

/** Solde d'un compte, corrigeable sur place : la différence devient un ajustement (P5). */
function BalanceFigure({ account }: { account: AccountFigure }) {
  const correct = useCorrectBalance();
  const sub =
    account.kind === 'business'
      ? account.monthExpenseCents !== 0
        ? `dépenses du mois ${formatSignedMoney(account.monthExpenseCents)}`
        : 'aucune dépense ce mois'
      : account.monthChangeCents !== 0
        ? `ce mois ${formatSignedMoney(account.monthChangeCents)}`
        : 'stable ce mois';

  return (
    <Figure label={account.name} sub={sub}>
      <InlineAmount
        value={account.balanceCents}
        signed
        onSave={(targetCents) => {
          if (targetCents !== null) correct.mutate({ account, targetCents });
        }}
        className="h-9 text-figure font-medium"
        title="Corriger le solde"
        aria-label={`Solde de ${account.name}`}
      />
    </Figure>
  );
}

/**
 * Chiffres clés, sans cartes : soldes, à recevoir (dont retards), encaissé du mois.
 * En-tête de la page Finances, et bandeau du dashboard.
 */
export function FinanceFigures({ summary, today, className = '' }: { summary: FinanceSummary; today: string; className?: string }) {
  const month = formatMonth(monthOf(today), today).toLowerCase();
  return (
    <div className={`grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-x-10 gap-y-8 ${className}`}>
      {summary.accounts.map((account) => (
        <BalanceFigure key={account.id} account={account} />
      ))}
      <Figure
        label="À recevoir"
        sub={
          summary.lateCents > 0 ? (
            <span className="text-danger">dont {formatMoney(summary.lateCents)} en retard</span>
          ) : summary.dueCents > 0 ? (
            'rien en retard'
          ) : undefined
        }
      >
        {formatMoney(summary.dueCents)}
      </Figure>
      <Figure
        label={`Encaissé en ${month}`}
        sub={summary.upcomingCents > 0 ? `prévu sur ${UPCOMING_DAYS} j : ${formatMoney(summary.upcomingCents)}` : undefined}
      >
        {formatMoney(summary.receivedMonthCents)}
      </Figure>
    </div>
  );
}
