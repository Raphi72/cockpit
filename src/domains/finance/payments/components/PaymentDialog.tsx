import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCreateStore, type CreateDefaults } from '@/app/create-store';
import { formatShortDate, todayISO } from '@/core/dates';
import { moneyToInput, parseMoneyInput } from '@/core/money';
import { ClientPicker } from '@/domains/clients/components/ClientPicker';
import type { ClientChoice } from '@/domains/clients/model';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { FormRow } from '@/ui/layout/FormRow';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { AmountField } from '@/ui/primitives/AmountField';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { useCreatePayment, useDeletePayment, useUpdatePayment } from '../hooks';
import { PAYMENT_STATUS_LABELS, validatePayment, type OpenPaymentStatus, type PaymentInput, type PaymentListItem } from '../model';

function initialClient(payment?: PaymentListItem): ClientChoice {
  if (payment?.clientId && payment.clientName) return { kind: 'existing', id: payment.clientId, name: payment.clientName };
  return { kind: 'none' };
}

function PaymentForm({
  payment,
  defaults,
  onDone,
}: {
  payment?: PaymentListItem;
  defaults: CreateDefaults;
  onDone: () => void;
}) {
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();
  const today = todayISO();
  const received = payment?.status === 'received';

  const [label, setLabel] = useState(payment?.label ?? '');
  const [amountText, setAmountText] = useState(moneyToInput(payment?.amountCents ?? null));
  const [dueDate, setDueDate] = useState<string | null>(payment?.dueDate ?? null);
  const [receivedDate, setReceivedDate] = useState<string | null>(payment?.receivedDate ?? null);
  const [status, setStatus] = useState<OpenPaymentStatus>(payment?.status === 'pending' ? 'pending' : 'planned');
  const [projectId, setProjectId] = useState<string | null>(payment ? payment.projectId : (defaults.projectId ?? null));
  const [client, setClient] = useState<ClientChoice>(initialClient(payment));
  const [invoiceRef, setInvoiceRef] = useState(payment?.invoiceRef ?? '');
  const [notes, setNotes] = useState(payment?.notes ?? '');
  const [moreOptions, setMoreOptions] = useState(Boolean(payment?.invoiceRef || payment?.notes));
  const [submitted, setSubmitted] = useState(false);

  const amountCents = parseMoneyInput(amountText);
  const input: PaymentInput = {
    label,
    amountCents: amountCents ?? null,
    dueDate,
    status,
    projectId,
    client,
    invoiceRef: invoiceRef || null,
    notes: notes || null,
    ...(received ? { receivedDate } : {}),
  };
  const errors = {
    ...validatePayment(input),
    ...(amountCents === undefined ? { amountCents: 'Montant invalide : écris par exemple 1500 ou 1 234,50.' } : {}),
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    if (payment) {
      updatePayment.mutate({ existing: payment, input }, { onSuccess: onDone });
    } else {
      createPayment.mutate(input, {
        onSuccess: () => {
          toast('Encaissement ajouté.');
          onDone();
        },
      });
    }
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
      <Input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Acompte, solde, facture n° 12…"
        aria-label="Libellé"
        className="h-10 text-[15px]"
      />
      {submitted && errors.label && <p className="mt-1.5 text-meta text-danger">{errors.label}</p>}

      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        <FormRow label="Montant" error={submitted ? errors.amountCents : undefined}>
          <AmountField
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-label="Montant"
            className="max-w-[200px]"
          />
        </FormRow>

        {received ? (
          <FormRow label="Reçu le" error={submitted ? errors.receivedDate : undefined}>
            <DateField value={receivedDate} onChange={setReceivedDate} aria-label="Date de réception" />
            <p className="mt-1.5 text-meta text-ink-3">
              {payment?.transactionAccountName
                ? `Sur ${payment.transactionAccountName} : la transaction suit les changements de montant et de date.`
                : 'Aucune transaction liée.'}
              {payment?.dueDate && ` Prévu le ${formatShortDate(payment.dueDate, today)}.`}
            </p>
          </FormRow>
        ) : (
          <>
            <FormRow label="Prévu le" error={submitted ? errors.dueDate : undefined}>
              <DateField value={dueDate} onChange={setDueDate} aria-label="Date prévue" />
            </FormRow>
            <FormRow label="Statut">
              <ChoiceChips
                label="Statut"
                options={[
                  { value: 'planned', label: PAYMENT_STATUS_LABELS.planned },
                  { value: 'pending', label: `${PAYMENT_STATUS_LABELS.pending} · facture envoyée` },
                ]}
                value={status}
                onChange={setStatus}
              />
            </FormRow>
          </>
        )}

        <FormRow label="Projet">
          <ProjectMenu variant="field" value={projectId} currentName={payment?.projectName} onChange={setProjectId} />
        </FormRow>

        {projectId === null && (
          <FormRow label="Client" error={submitted ? errors.client : undefined}>
            <ClientPicker variant="field" value={client} onChange={setClient} />
          </FormRow>
        )}
      </div>

      {moreOptions ? (
        <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
          <FormRow label="Facture">
            <Input
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              placeholder="N° de facture"
              aria-label="Numéro de facture"
              className="max-w-[200px]"
            />
          </FormRow>
          <FormRow label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conditions, relances…" aria-label="Notes" />
          </FormRow>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMoreOptions(true)}
          className="mt-4 text-meta text-ink-3 transition-colors hover:text-ink"
        >
          + N° de facture et notes
        </button>
      )}

      <DialogFooter>
        {payment && (
          <Button
            variant="ghost"
            icon={Trash2}
            className="mr-auto"
            onClick={() => {
              onDone();
              deletePayment.mutate(payment);
            }}
          >
            Supprimer
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button
          type="submit"
          variant="primary"
          shortcut="Ctrl ↵"
          disabled={createPayment.isPending || updatePayment.isPending}
        >
          {payment ? 'Enregistrer' : 'Ajouter l’encaissement'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type PaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent : création. Présent : modification. */
  payment?: PaymentListItem | null;
  defaults?: CreateDefaults;
};

export function PaymentDialog({ open, onOpenChange, payment, defaults = {} }: PaymentDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={payment ? 'Encaissement' : 'Nouvel encaissement'}
      restoreFocus={Boolean(payment)}
    >
      {open && <PaymentForm payment={payment ?? undefined} defaults={defaults} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

/** Fenêtre de création globale (menu « Nouveau », touche R). */
export function CreatePaymentDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'payment' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  return <PaymentDialog open={open !== null} onOpenChange={(next) => !next && close()} defaults={open?.defaults} />;
}
