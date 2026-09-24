import { Check } from 'lucide-react';
import { relativeDateLabel } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { useCreatePayment, useProjectPayments, useSetPaymentReceived } from '@/domains/finance/payments/hooks';
import { isPaymentLate, type Payment } from '@/domains/finance/payments/model';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { InlineAmount } from '@/ui/primitives/InlineFields';
import { useUpdateProject } from '../hooks';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { projectMoney, type ProjectDetail } from '../model';

function PaymentRow({ payment, today }: { payment: Payment; today: string }) {
  const setReceived = useSetPaymentReceived();
  const received = payment.status === 'received';
  const late = isPaymentLate(payment, today);
  const date = received ? payment.receivedDate : payment.dueDate;

  return (
    <li className="-mx-2 grid min-h-10 grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 hover:bg-hover">
      <button
        type="button"
        onClick={() => setReceived.mutate({ id: payment.id, receivedDate: received ? null : today })}
        aria-label={received ? 'Annuler la réception' : 'Marquer comme reçu'}
        title={received ? 'Annuler la réception' : 'Marquer comme reçu aujourd’hui'}
        className={
          'grid size-[18px] place-items-center rounded-full border-[1.5px] transition-colors duration-[120ms] ease-soft ' +
          (received ? 'border-success bg-success' : 'border-line-strong hover:border-ink-3')
        }
      >
        {received && <Check className="size-3 text-white" strokeWidth={3} />}
      </button>
      <span className="min-w-0">
        <span className={`block truncate ${received ? 'text-ink-3' : ''}`}>{payment.label}</span>
        <span className={`tnum block text-meta ${late ? 'text-danger' : 'text-ink-3'}`}>
          {received ? 'reçu ' : late ? 'en retard · ' : ''}
          {date ? relativeDateLabel(date, today) : 'date à définir'}
        </span>
      </span>
      <span className={`tnum font-medium ${received ? 'text-ink-3' : ''}`}>{formatMoney(payment.amountCents)}</span>
    </li>
  );
}

/** Budget et échéancier : reçu, restant et pourcentage payé sont calculés, jamais saisis. */
export function ProjectFinance({ project, today }: { project: ProjectDetail; today: string }) {
  const update = useUpdateProject(project.id);
  const { data: payments = [] } = useProjectPayments(project.id);
  const createPayment = useCreatePayment();
  const money = projectMoney(project);
  const hasBudget = project.budgetCents !== null && project.budgetCents > 0;

  return (
    <div>
      <PropertyRow label="Budget">
        <InlineAmount value={project.budgetCents} onSave={(budgetCents) => update.mutate({ budgetCents })} aria-label="Budget" />
      </PropertyRow>

      {hasBudget && (
        <>
          <PropertyRow label="Reçu">
            <div className="tnum flex h-8 items-center gap-2">
              {formatMoney(money.received)}
              <span className="text-meta text-ink-3">sur {formatMoney(money.budget)}</span>
            </div>
          </PropertyRow>
          <PropertyRow label="Reste">
            <div className="tnum flex h-8 items-center">{formatMoney(money.remaining)}</div>
          </PropertyRow>
          <div className="py-2">
            <ProgressBar percent={money.percentPaid} tone="success" />
          </div>
        </>
      )}

      {payments.length > 0 && (
        <ul className="mt-3">
          {payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} today={today} />
          ))}
        </ul>
      )}

      {hasBudget && money.unplanned > 0 && (
        <p className="mt-3 text-meta text-ink-3">
          <span className="tnum">{formatMoney(money.unplanned)}</span> du budget sans échéance ·{' '}
          <button
            type="button"
            className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
            onClick={() =>
              createPayment.mutate({
                projectId: project.id,
                label: payments.length > 0 ? 'Solde' : 'Paiement',
                amountCents: money.unplanned,
                dueDate: project.deadline,
              })
            }
          >
            créer l’échéance
          </button>
        </p>
      )}
    </div>
  );
}
