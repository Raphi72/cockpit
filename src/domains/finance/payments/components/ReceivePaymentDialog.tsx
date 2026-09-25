import { useState, type FormEvent } from 'react';
import { formatShortDate, todayISO } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { FormRow } from '@/ui/layout/FormRow';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { Checkbox } from '@/ui/primitives/Checkbox';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { DateField } from '@/ui/primitives/DateField';
import { AccountMenu } from '../../accounts/components/AccountMenu';
import { useAccounts } from '../../accounts/hooks';
import { defaultAccountId } from '../../accounts/model';
import { useReceivePayment } from '../hooks';
import { paymentContext, validateReceive, type PaymentListItem } from '../model';
import { useReceiveDialog } from '../receive-store';

function ReceiveForm({ payment, onDone }: { payment: PaymentListItem; onDone: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const receive = useReceivePayment();
  const today = todayISO();
  const [receivedDate, setReceivedDate] = useState<string | null>(today);
  const [createTransaction, setCreateTransaction] = useState(true);
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const account = accounts.find((a) => a.id === (chosenAccountId ?? defaultAccountId(accounts)));
  const errors = validateReceive({ receivedDate: receivedDate ?? '', accountId: null });
  // Proposer la date prévue quand elle est passée : l'argent est peut-être arrivé ce jour-là.
  const duePassed = payment.dueDate !== null && payment.dueDate < today;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (!receivedDate || Object.keys(errors).length > 0) return;
    const accountId = createTransaction && account ? account.id : null;
    receive.mutate(
      { payment, input: { receivedDate, accountId }, accountName: accountId ? (account?.name ?? null) : null },
      { onSuccess: onDone },
    );
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          submit();
        }
      }}
      className="mt-5"
    >
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <FormRow label="Reçu le" error={submitted ? errors.receivedDate : undefined}>
          <div className="flex flex-wrap items-center gap-1.5">
            {duePassed && (
              <ChoiceChips
                label="Date de réception"
                options={[
                  { value: today, label: 'Aujourd’hui' },
                  { value: payment.dueDate!, label: `Le ${formatShortDate(payment.dueDate!, today)}` },
                ]}
                value={receivedDate === today || receivedDate === payment.dueDate ? receivedDate : null}
                onChange={setReceivedDate}
              />
            )}
            <DateField value={receivedDate} onChange={setReceivedDate} clearable={false} aria-label="Date de réception" className="w-[170px]" />
          </div>
        </FormRow>
      </div>

      <div className="mt-5 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2">
        <Checkbox checked={createTransaction} onChange={setCreateTransaction}>
          Ajouter le revenu sur
        </Checkbox>
        <div className={`w-[220px] ${createTransaction ? '' : 'pointer-events-none opacity-40'}`}>
          <AccountMenu accounts={accounts} value={account?.id ?? null} onChange={setChosenAccountId} />
        </div>
      </div>
      <p className="mt-2 text-meta text-ink-3">
        {createTransaction
          ? 'Le solde de ce compte augmente d’autant. Le revenu reste lié à cet encaissement : il n’est jamais compté deux fois.'
          : 'Seul l’encaissement est marqué reçu : aucun solde ne bouge.'}
      </p>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" shortcut="Ctrl ↵" disabled={receive.isPending}>
          Marquer reçu
        </Button>
      </DialogFooter>
    </form>
  );
}

/** « Marquer reçu » : petit dialogue commun à la fiche projet et à la page Finances (P4). */
export function ReceivePaymentDialog() {
  const payment = useReceiveDialog((state) => state.payment);
  const close = useReceiveDialog((state) => state.close);
  const context = payment ? paymentContext(payment) : null;

  return (
    <Dialog
      open={payment !== null}
      onOpenChange={(open) => !open && close()}
      title={payment ? `Marquer « ${payment.label} » comme reçu` : 'Marquer reçu'}
      description={payment ? [context, formatMoney(payment.amountCents)].filter(Boolean).join(' · ') : undefined}
      width={520}
    >
      {payment && <ReceiveForm payment={payment} onDone={close} />}
    </Dialog>
  );
}
