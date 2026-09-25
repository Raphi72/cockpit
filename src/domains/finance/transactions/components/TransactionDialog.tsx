import { ArrowRight, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCreateStore, type CreateDefaults } from '@/app/create-store';
import { useUiStore } from '@/app/ui-store';
import { todayISO } from '@/core/dates';
import { formatSignedMoney, moneyToInput, parseMoneyInput } from '@/core/money';
import { ProjectMenu } from '@/domains/projects/components/ProjectMenu';
import { FormRow } from '@/ui/layout/FormRow';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { toast } from '@/ui/overlays/toast';
import { AmountField } from '@/ui/primitives/AmountField';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { DateField } from '@/ui/primitives/DateField';
import { Input, Textarea } from '@/ui/primitives/Input';
import { AccountMenu } from '../../accounts/components/AccountMenu';
import { useAccounts } from '../../accounts/hooks';
import { defaultAccountId, otherAccountId } from '../../accounts/model';
import { useTransactionEditor } from '../editor-store';
import { useCreateTransaction, useDeleteTransaction, useTransaction, useUpdateTransaction } from '../hooks';
import {
  TRANSACTION_KIND_LABELS,
  inputFromTransaction,
  validateTransaction,
  type TransactionInput,
  type TransactionListItem,
} from '../model';
import { CategoryMenu } from './CategoryMenu';

type EditableKind = TransactionInput['kind'];

const LABEL_PLACEHOLDERS: Record<EditableKind, string> = {
  expense: 'Abonnement, matériel, train…',
  income: 'Vente, remboursement…',
  transfer: 'Virement (facultatif)',
};

function TransactionForm({
  transaction,
  defaults,
  onDone,
}: {
  transaction?: TransactionListItem;
  defaults: CreateDefaults;
  onDone: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const lastAccountId = useUiStore((state) => state.lastAccountId);
  const setLastAccountId = useUiStore((state) => state.setLastAccountId);
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const initial = transaction ? inputFromTransaction(transaction) : null;
  const adjustment = transaction?.kind === 'adjustment';
  // Un revenu issu d'un encaissement reste un revenu : son type ne change pas.
  const linkedToPayment = Boolean(transaction?.paymentId);

  const [kind, setKind] = useState<EditableKind>(initial?.kind ?? 'expense');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [amountText, setAmountText] = useState(moneyToInput(initial?.amountCents ?? null));
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(initial?.accountId ?? null);
  const [chosenToAccountId, setChosenToAccountId] = useState<string | null>(initial?.toAccountId ?? null);
  const [date, setDate] = useState<string | null>(initial?.date ?? todayISO());
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [projectId, setProjectId] = useState<string | null>(initial ? initial.projectId : (defaults.projectId ?? null));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [moreOptions, setMoreOptions] = useState(Boolean(initial?.notes || initial?.projectId || defaults.projectId));
  const [submitted, setSubmitted] = useState(false);

  const knownLast = accounts.some((a) => a.id === lastAccountId) ? lastAccountId : null;
  const accountId = chosenAccountId ?? knownLast ?? defaultAccountId(accounts) ?? '';
  const toAccountId = chosenToAccountId ?? otherAccountId(accounts, accountId);
  const amountCents = parseMoneyInput(amountText);

  const input: TransactionInput = {
    kind,
    amountCents: amountCents ?? null,
    accountId,
    toAccountId: kind === 'transfer' ? toAccountId : null,
    date: date ?? '',
    label,
    categoryId: kind === 'transfer' ? null : categoryId,
    projectId: kind === 'transfer' ? null : projectId,
    notes: notes || null,
  };
  const errors = adjustment
    ? { ...(validateTransaction(input).date ? { date: 'Date invalide.' } : {}) }
    : {
        ...validateTransaction(input),
        ...(amountCents === undefined ? { amountCents: 'Montant invalide : écris par exemple 35 ou 12,90.' } : {}),
      };

  const changeKind = (next: EditableKind) => {
    // Les catégories de revenus et de dépenses sont distinctes.
    if ((next === 'income') !== (kind === 'income')) setCategoryId(null);
    setKind(next);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    if (!adjustment) setLastAccountId(accountId);
    if (transaction) {
      updateTransaction.mutate({ existing: transaction, input }, { onSuccess: onDone });
    } else {
      createTransaction.mutate(input, {
        onSuccess: () => {
          toast(kind === 'transfer' ? 'Virement enregistré.' : 'Transaction ajoutée.');
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
        placeholder={adjustment ? 'Ajustement' : LABEL_PLACEHOLDERS[kind]}
        aria-label="Libellé"
        className="h-10 text-[15px]"
      />
      {submitted && errors.label && <p className="mt-1.5 text-meta text-danger">{errors.label}</p>}

      <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
        {adjustment ? (
          <FormRow label="Montant">
            <p className="tnum pt-2">
              {formatSignedMoney(transaction!.amountCents)}
              <span className="ml-2 text-meta text-ink-3">sur {transaction!.accountName}</span>
            </p>
            <p className="mt-1 text-meta text-ink-3">
              Correction de solde : pour la changer, corrige de nouveau le solde, ou supprime-la.
            </p>
          </FormRow>
        ) : (
          <>
            {!linkedToPayment && (
              <FormRow label="Type">
                <ChoiceChips
                  label="Type"
                  options={(['expense', 'income', 'transfer'] as EditableKind[]).map((value) => ({
                    value,
                    label: TRANSACTION_KIND_LABELS[value],
                  }))}
                  value={kind}
                  onChange={changeKind}
                />
              </FormRow>
            )}

            <FormRow label="Montant" error={submitted ? errors.amountCents : undefined}>
              <AmountField
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                aria-label="Montant"
                className="max-w-[200px]"
              />
            </FormRow>

            {kind === 'transfer' ? (
              <FormRow label="Comptes" error={submitted ? errors.toAccountId : undefined}>
                <div className="flex items-center gap-2">
                  <AccountMenu accounts={accounts} value={accountId} onChange={setChosenAccountId} aria-label="Depuis le compte" />
                  <ArrowRight className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
                  <AccountMenu accounts={accounts} value={toAccountId} onChange={setChosenToAccountId} aria-label="Vers le compte" />
                </div>
              </FormRow>
            ) : (
              <FormRow label="Compte">
                <AccountMenu accounts={accounts} value={accountId} onChange={setChosenAccountId} />
                {linkedToPayment && (
                  <p className="mt-1.5 text-meta text-ink-3">Revenu créé à la réception d’un encaissement.</p>
                )}
              </FormRow>
            )}
          </>
        )}

        <FormRow label="Date" error={submitted ? errors.date : undefined}>
          <DateField value={date} onChange={setDate} clearable={false} aria-label="Date" />
        </FormRow>

        {!adjustment && kind !== 'transfer' && (
          <FormRow label="Catégorie">
            <CategoryMenu kind={kind} value={categoryId} onChange={setCategoryId} />
          </FormRow>
        )}
      </div>

      {moreOptions || adjustment ? (
        <div className="mt-5 grid grid-cols-[92px_minmax(0,1fr)] gap-x-4 gap-y-3">
          {!adjustment && kind !== 'transfer' && (
            <FormRow label="Projet">
              <ProjectMenu variant="field" value={projectId} currentName={transaction?.projectName} onChange={setProjectId} />
            </FormRow>
          )}
          <FormRow label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Détails…" aria-label="Notes" />
          </FormRow>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMoreOptions(true)}
          className="mt-4 text-meta text-ink-3 transition-colors hover:text-ink"
        >
          {kind === 'transfer' ? '+ Notes' : '+ Projet et notes'}
        </button>
      )}

      <DialogFooter>
        {transaction && (
          <Button
            variant="ghost"
            icon={Trash2}
            className="mr-auto"
            onClick={() => {
              onDone();
              deleteTransaction.mutate(transaction);
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
          disabled={createTransaction.isPending || updateTransaction.isPending}
        >
          {transaction ? 'Enregistrer' : kind === 'transfer' ? 'Enregistrer le virement' : 'Ajouter la transaction'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type TransactionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent : création. Présent : modification. */
  transaction?: TransactionListItem | null;
  defaults?: CreateDefaults;
};

export function TransactionDialog({ open, onOpenChange, transaction, defaults = {} }: TransactionDialogProps) {
  const title = transaction
    ? transaction.kind === 'adjustment'
      ? 'Ajustement de solde'
      : TRANSACTION_KIND_LABELS[transaction.kind]
    : 'Nouvelle transaction';
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} restoreFocus={Boolean(transaction)}>
      {open && (
        <TransactionForm transaction={transaction ?? undefined} defaults={defaults} onDone={() => onOpenChange(false)} />
      )}
    </Dialog>
  );
}

/** Transaction ouverte par son identifiant (recherche Ctrl+K). */
export function TransactionEditorDialog() {
  const transactionId = useTransactionEditor((state) => state.transactionId);
  const close = useTransactionEditor((state) => state.close);
  const { data: transaction } = useTransaction(transactionId);
  return (
    <TransactionDialog
      open={transactionId !== null && Boolean(transaction)}
      onOpenChange={(next) => !next && close()}
      transaction={transaction}
    />
  );
}

/** Fenêtre de création globale (menu « Nouveau », touche D). */
export function CreateTransactionDialog() {
  const open = useCreateStore((state) => (state.open?.kind === 'transaction' ? state.open : null));
  const close = useCreateStore((state) => state.close);
  return <TransactionDialog open={open !== null} onOpenChange={(next) => !next && close()} defaults={open?.defaults} />;
}
