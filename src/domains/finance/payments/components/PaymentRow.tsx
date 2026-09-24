import { Check } from 'lucide-react';
import { memo } from 'react';
import { daysBetween, formatShortDate, relativeDateLabel } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { ColorDot } from '@/ui/data/ColorDot';
import { useUnreceivePayment } from '../hooks';
import { isPaymentLate, paymentContext, type PaymentListItem } from '../model';
import { useReceiveDialog } from '../receive-store';

/**
 * Le rond d'un encaissement : vide, il ouvre « Marquer reçu » ; plein (vert), un clic annule
 * la réception, avec « Annuler » dans le toast.
 */
export function ReceiveToggle({ payment }: { payment: PaymentListItem }) {
  const openReceive = useReceiveDialog((state) => state.openReceive);
  const unreceive = useUnreceivePayment();
  const received = payment.status === 'received';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (received) unreceive.mutate(payment);
        else openReceive(payment);
      }}
      aria-label={received ? 'Annuler la réception' : 'Marquer comme reçu'}
      title={received ? 'Annuler la réception' : 'Marquer comme reçu…'}
      className={
        'grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-[120ms] ease-soft ' +
        (received ? 'border-success bg-success' : 'border-line-strong hover:border-success')
      }
    >
      {received && <Check className="size-3 text-white" strokeWidth={3} />}
    </button>
  );
}

/** Date qui compte : la réception pour un encaissement reçu, sinon l'échéance (rouge si dépassée). */
export function PaymentDate({ payment, today }: { payment: PaymentListItem; today: string }) {
  if (payment.status === 'received' && payment.receivedDate) {
    return (
      <span className="tnum text-meta text-ink-3" title={payment.transactionAccountName ? `Sur ${payment.transactionAccountName}` : undefined}>
        reçu {relativeDateLabel(payment.receivedDate, today)}
      </span>
    );
  }
  const pending = payment.status === 'pending' ? 'en attente · ' : '';
  if (!payment.dueDate) return <span className="text-meta text-ink-3">{pending}date à définir</span>;
  const late = isPaymentLate(payment, today);
  const diff = daysBetween(today, payment.dueDate);
  const tone = late ? 'text-danger' : diff <= 3 ? 'text-warning' : 'text-ink-3';
  return (
    <span className={`tnum text-meta ${tone}`} title={`Prévu le ${formatShortDate(payment.dueDate, today)}`}>
      {pending}
      {late ? `${-diff} j de retard` : relativeDateLabel(payment.dueDate, today)}
    </span>
  );
}

type PaymentRowProps = {
  payment: PaymentListItem;
  today: string;
  onOpen: (payment: PaymentListItem) => void;
};

/** Ligne d'encaissement : rond, libellé, projet ou client, date qui compte, montant. */
export const PaymentRow = memo(function PaymentRow({ payment, today, onOpen }: PaymentRowProps) {
  const context = paymentContext(payment);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(payment)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === 'Enter') onOpen(payment);
      }}
      className={
        '-mx-2.5 grid min-h-11 cursor-default grid-cols-[18px_minmax(0,1fr)_150px_110px] items-center gap-3.5 rounded-md px-2.5 outline-none ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft'
      }
    >
      <ReceiveToggle payment={payment} />
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span className="truncate">{payment.label}</span>
        {context && (
          <span className="flex min-w-0 items-center gap-2 self-center text-meta text-ink-3">
            {payment.projectColor && <ColorDot color={payment.projectColor} />}
            <span className="truncate">{context}</span>
          </span>
        )}
      </span>
      <span className="text-right">
        <PaymentDate payment={payment} today={today} />
      </span>
      <span className="tnum text-right font-medium">{formatMoney(payment.amountCents)}</span>
    </div>
  );
});
