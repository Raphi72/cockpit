import { useState, type ReactNode } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatShortDate } from '@/core/dates';
import { formatMoney, formatSignedMoney } from '@/core/money';
import { PaymentDialog } from '@/domains/finance/payments/components/PaymentDialog';
import { PaymentDate, ReceiveToggle } from '@/domains/finance/payments/components/PaymentRow';
import { useCreatePayment, useProjectPayments } from '@/domains/finance/payments/hooks';
import type { PaymentListItem } from '@/domains/finance/payments/model';
import { TransactionDialog } from '@/domains/finance/transactions/components/TransactionDialog';
import { useProjectExpenses } from '@/domains/finance/transactions/hooks';
import type { TransactionListItem } from '@/domains/finance/transactions/model';
import { ProgressBar } from '@/ui/data/ProgressBar';
import { PropertyRow } from '@/ui/layout/PropertyRow';
import { InlineAmount } from '@/ui/primitives/InlineFields';
import { useUpdateProject } from '../hooks';
import { projectMoney, type ProjectDetail } from '../model';

const rowClass =
  '-mx-2 grid min-h-10 cursor-default items-center gap-3 rounded-md px-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft';

function ClickableRow({ onOpen, className, children }: { onOpen: () => void; className: string; children: ReactNode }) {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === 'Enter') onOpen();
      }}
      className={`${rowClass} ${className}`}
    >
      {children}
    </li>
  );
}

function PaymentItem({ payment, today, onOpen }: { payment: PaymentListItem; today: string; onOpen: () => void }) {
  const received = payment.status === 'received';
  return (
    <ClickableRow onOpen={onOpen} className="grid-cols-[18px_minmax(0,1fr)_auto]">
      <ReceiveToggle payment={payment} />
      <span className="min-w-0">
        <span className={`block truncate ${received ? 'text-ink-3' : ''}`}>{payment.label}</span>
        <span className="block">
          <PaymentDate payment={payment} today={today} />
        </span>
      </span>
      <span className={`tnum font-medium ${received ? 'text-ink-3' : ''}`}>{formatMoney(payment.amountCents)}</span>
    </ClickableRow>
  );
}

function ExpenseItem({ expense, today, onOpen }: { expense: TransactionListItem; today: string; onOpen: () => void }) {
  return (
    <ClickableRow onOpen={onOpen} className="grid-cols-[minmax(0,1fr)_auto]">
      <span className="min-w-0">
        <span className="block truncate">{expense.label}</span>
        <span className="tnum block text-meta text-ink-3">{formatShortDate(expense.date, today)}</span>
      </span>
      <span className="tnum">{formatSignedMoney(expense.amountCents)}</span>
    </ClickableRow>
  );
}

function QuietLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-meta text-ink-3 transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}

/**
 * Budget, échéancier et dépenses du projet. Reçu, reste, pourcentage payé et marge sont calculés,
 * jamais saisis. Un clic sur une ligne l'ouvre ; le rond passe par « Marquer reçu ».
 */
export function ProjectFinance({ project, today }: { project: ProjectDetail; today: string }) {
  const update = useUpdateProject(project.id);
  const openCreate = useCreateStore((state) => state.openCreate);
  const { data: payments = [] } = useProjectPayments(project.id);
  const { data: expenses = [] } = useProjectExpenses(project.id);
  const createPayment = useCreatePayment();
  const [editingPayment, setEditingPayment] = useState<PaymentListItem | null>(null);
  const [editingExpense, setEditingExpense] = useState<TransactionListItem | null>(null);

  const money = projectMoney(project);
  const hasBudget = project.budgetCents !== null && project.budgetCents > 0;
  const expenseCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

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
            <PaymentItem key={payment.id} payment={payment} today={today} onOpen={() => setEditingPayment(payment)} />
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
                label: payments.length > 0 ? 'Solde' : 'Paiement',
                amountCents: money.unplanned,
                dueDate: project.deadline,
                status: 'planned',
                projectId: project.id,
                client: { kind: 'none' },
                invoiceRef: null,
                notes: null,
              })
            }
          >
            créer l’échéance
          </button>
        </p>
      )}

      {expenses.length > 0 && (
        <div className="mt-5">
          <PropertyRow label="Dépenses">
            <div className="tnum flex h-8 items-center">{formatSignedMoney(expenseCents)}</div>
          </PropertyRow>
          <PropertyRow label="Marge">
            <div className="tnum flex h-8 items-center" title="Reçu moins les dépenses du projet">
              {formatMoney(money.received + expenseCents)}
            </div>
          </PropertyRow>
          <ul className="mt-1">
            {expenses.map((expense) => (
              <ExpenseItem key={expense.id} expense={expense} today={today} onOpen={() => setEditingExpense(expense)} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex gap-4">
        <QuietLink onClick={() => openCreate('payment', { projectId: project.id })}>+ Échéance</QuietLink>
        <QuietLink onClick={() => openCreate('transaction', { projectId: project.id })}>+ Dépense</QuietLink>
      </div>

      <PaymentDialog
        open={editingPayment !== null}
        onOpenChange={(next) => !next && setEditingPayment(null)}
        payment={editingPayment}
      />
      <TransactionDialog
        open={editingExpense !== null}
        onOpenChange={(next) => !next && setEditingExpense(null)}
        transaction={editingExpense}
      />
    </div>
  );
}
