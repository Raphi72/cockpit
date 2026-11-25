import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonth } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { Button } from '@/ui/primitives/Button';
import { useFirstRevenueYear, useYearRevenue } from '../hooks';
import {
  monthState,
  quarterLabel,
  quarterPeriod,
  quarterState,
  resolveRevenueYear,
  revenueCountLabel,
  type PeriodState,
  type QuarterRevenue,
} from '../model';

/** Une période à venir n'a pas encore de chiffre : un tiret, pas un zéro qui ressemblerait à un résultat. */
function Amount({ cents, state, strong = false }: { cents: number; state: PeriodState; strong?: boolean }) {
  if (state === 'future' && cents === 0) return <span className="text-ink-3">–</span>;
  return <span className={strong ? 'font-medium' : ''}>{formatMoney(cents)}</span>;
}

function Quarter({ quarter, today }: { quarter: QuarterRevenue; today: string }) {
  const state = quarterState(quarter, today);
  return (
    <section className={state === 'future' ? 'text-ink-3' : ''}>
      <div className="flex min-h-10 items-baseline gap-3 border-b border-line pb-2">
        <h3 className="font-medium">{quarterLabel(quarter.quarter)}</h3>
        <span className="text-meta text-ink-3">
          {quarterPeriod(quarter)}
          {state === 'current' && ' · en cours'}
        </span>
        <span className="tnum ml-auto">
          <Amount cents={quarter.cents} state={state} strong />
        </span>
      </div>
      {quarter.months.map((month) => {
        const mState = monthState(month.month, today);
        return (
          <div key={month.month} className={`flex min-h-9 items-baseline gap-3 pl-4 ${mState === 'future' ? 'text-ink-3' : 'text-ink-2'}`}>
            <span>{formatMonth(month.month, month.month)}</span>
            <span className="text-meta text-ink-3">
              {[mState === 'current' ? 'en cours' : null, revenueCountLabel(month.count)].filter(Boolean).join(' · ')}
            </span>
            <span className="tnum ml-auto">
              <Amount cents={month.cents} state={mState} />
            </span>
          </div>
        );
      })}
    </section>
  );
}

type RevenueViewProps = {
  /** Année demandée dans l'URL interne (absente : l'année en cours). */
  year: number | undefined;
  onYear: (year: number | undefined) => void;
  today: string;
};

/**
 * Chiffre d'affaires par trimestre et par mois, pour la déclaration à l'URSSAF : les encaissements
 * reçus, à leur date de réception. Une année à la fois ; rien à saisir ici, tout vient des encaissements.
 */
export function RevenueView({ year: wanted, onYear, today }: RevenueViewProps) {
  const currentYear = Number(today.slice(0, 4));
  const { data: firstYear } = useFirstRevenueYear();
  const year = resolveRevenueYear(wanted, firstYear ?? null, today);
  const { data: revenue } = useYearRevenue(year);
  const setYear = (next: number) => onYear(next === currentYear ? undefined : next);
  if (firstYear === undefined || !revenue) return null;

  return (
    <div className="max-w-[640px]">
      <div className="mb-2 flex items-center gap-1">
        <Button
          variant="ghost"
          icon={ChevronLeft}
          aria-label="Année précédente"
          disabled={year <= Math.min(firstYear ?? currentYear, currentYear)}
          onClick={() => setYear(year - 1)}
        />
        <span className="tnum min-w-[56px] text-center font-medium">{year}</span>
        <Button variant="ghost" icon={ChevronRight} aria-label="Année suivante" disabled={year >= currentYear} onClick={() => setYear(year + 1)} />
        {year !== currentYear && (
          <Button variant="ghost" className="ml-1 text-meta" onClick={() => setYear(currentYear)}>
            Cette année
          </Button>
        )}
        <span className="tnum ml-auto">
          <span className="mr-3 text-meta text-ink-3">Total {year}</span>
          <span className="text-[17px] font-semibold tracking-tight">{formatMoney(revenue.cents)}</span>
        </span>
      </div>
      <p className="mb-8 text-meta text-ink-3">
        Les encaissements reçus, à leur date de réception : le montant à déclarer à l’URSSAF, au mois ou au trimestre.
      </p>

      <div className="flex flex-col gap-8">
        {revenue.quarters.map((quarter) => (
          <Quarter key={quarter.quarter} quarter={quarter} today={today} />
        ))}
      </div>
    </div>
  );
}
