import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCreateStore } from '@/app/create-store';
import { formatMonth, monthOf, shiftMonth } from '@/core/dates';
import { formatSignedMoney } from '@/core/money';
import { useToday } from '@/core/use-today';
import { Page } from '@/ui/layout/Page';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { SegmentedTabs } from '@/ui/primitives/SegmentedTabs';
import { InitialBalances } from '../accounts/components/InitialBalances';
import { useAccounts, useNeedsInitialBalances } from '../accounts/hooks';
import { FinanceFigures } from '../components/FinanceFigures';
import { useFinanceSummary } from '../hooks';
import { PaymentDialog } from '../payments/components/PaymentDialog';
import { PaymentRow } from '../payments/components/PaymentRow';
import { useOpenPayments, useReceivedPayments } from '../payments/hooks';
import { isPaymentLate, type PaymentListItem } from '../payments/model';
import { FINANCE_VIEWS, FINANCE_VIEW_LABELS, type FinanceView, type FinancesSearch } from '../search';
import { TransactionDialog } from '../transactions/components/TransactionDialog';
import { TransactionRow } from '../transactions/components/TransactionRow';
import { useCategories, useTransactions } from '../transactions/hooks';
import {
  TRANSACTION_KINDS,
  TRANSACTION_KIND_LABELS,
  summarizeTransactions,
  type TransactionKind,
  type TransactionListItem,
} from '../transactions/model';

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-ink-3">{children}</p>;
}

// ─── Filtres des transactions ───────────────────────────────────────────────

type FilterOption = { value: string; label: string };

/** Filtre discret : « Tous les comptes » tant qu'il n'est pas utilisé, la valeur choisie ensuite. */
function FilterMenu({
  allLabel,
  options,
  value,
  onChange,
}: {
  allLabel: string;
  options: FilterOption[];
  value?: string;
  onChange: (value?: string) => void;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" className={selected ? '!text-ink' : ''}>
          {selected?.label ?? allLabel}
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-80 overflow-y-auto">
        <MenuRadioGroup value={value ?? 'all'} onValueChange={(v) => onChange(v === 'all' ? undefined : v)}>
          <MenuRadioItem value="all">{allLabel}</MenuRadioItem>
          <MenuSeparator />
          {options.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function TransactionsView({
  search,
  onSearch,
  today,
  onOpen,
}: {
  search: FinancesSearch;
  onSearch: (patch: Partial<FinancesSearch>) => void;
  today: string;
  onOpen: (item: TransactionListItem) => void;
}) {
  const openCreate = useCreateStore((state) => state.openCreate);
  const currentMonth = monthOf(today);
  const month = search.month ?? currentMonth;
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: items } = useTransactions({
    month,
    accountId: search.account,
    kind: search.kind,
    categoryId: search.category,
  });
  const totals = summarizeTransactions(items ?? []);
  const setMonth = (next: string) => onSearch({ month: next === currentMonth ? undefined : next });
  const filtered = Boolean(search.account || search.kind || search.category);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" icon={ChevronLeft} aria-label="Mois précédent" onClick={() => setMonth(shiftMonth(month, -1))} />
          <span className="min-w-[132px] text-center font-medium">{formatMonth(month, today)}</span>
          <Button variant="ghost" icon={ChevronRight} aria-label="Mois suivant" onClick={() => setMonth(shiftMonth(month, 1))} />
          {month !== currentMonth && (
            <Button variant="ghost" className="ml-1 text-meta" onClick={() => setMonth(currentMonth)}>
              Ce mois-ci
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <FilterMenu
            allLabel="Tous les comptes"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={search.account}
            onChange={(account) => onSearch({ account })}
          />
          <FilterMenu
            allLabel="Tous les types"
            options={TRANSACTION_KINDS.map((k) => ({ value: k, label: TRANSACTION_KIND_LABELS[k] }))}
            value={search.kind}
            onChange={(kind) => onSearch({ kind: kind as TransactionKind | undefined })}
          />
          <FilterMenu
            allLabel="Toutes les catégories"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            value={search.category}
            onChange={(category) => onSearch({ category })}
          />
        </div>
      </div>

      {items && items.length > 0 && (totals.incomeCents !== 0 || totals.expenseCents !== 0) && (
        <p className="tnum mb-3 text-meta text-ink-3">
          Entrées <span className="text-ink-2">{formatSignedMoney(totals.incomeCents)}</span> · Sorties{' '}
          <span className="text-ink-2">{formatSignedMoney(totals.expenseCents)}</span>
          <span className="ml-1.5">(hors virements et ajustements)</span>
        </p>
      )}

      {items?.length === 0 && (
        <div className="py-6 text-ink-3">
          <p>{filtered ? 'Aucune transaction ne correspond à ces filtres.' : `Aucune transaction en ${formatMonth(month, today).toLowerCase()}.`}</p>
          {!filtered && (
            <Button variant="ghost" icon={Plus} className="mt-2 -ml-3" onClick={() => openCreate('transaction')}>
              Ajouter une transaction
            </Button>
          )}
        </div>
      )}
      {items?.map((item) => (
        <TransactionRow key={item.id} item={item} today={today} accountFiltered={Boolean(search.account)} onOpen={onOpen} />
      ))}
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

function PaymentList({
  payments,
  today,
  empty,
  onOpen,
}: {
  payments: PaymentListItem[];
  today: string;
  empty: string;
  onOpen: (payment: PaymentListItem) => void;
}) {
  if (payments.length === 0) return <Empty>{empty}</Empty>;
  return (
    <>
      {payments.map((payment) => (
        <PaymentRow key={payment.id} payment={payment} today={today} onOpen={onOpen} />
      ))}
    </>
  );
}

export function FinancesPage() {
  const search = useSearch({ from: '/finances' });
  const navigate = useNavigate({ from: '/finances' });
  const openCreate = useCreateStore((state) => state.openCreate);
  const today = useToday();
  const view: FinanceView = search.view ?? 'due';

  const { data: summary } = useFinanceSummary(today);
  const { data: needsInitialBalances } = useNeedsInitialBalances();
  const [later, setLater] = useState(false);
  const { data: open = [] } = useOpenPayments();
  const received = useReceivedPayments();
  const [editingPayment, setEditingPayment] = useState<PaymentListItem | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionListItem | null>(null);

  if (!summary) return null;

  const late = open.filter((p) => isPaymentLate(p, today));
  const counts: Partial<Record<FinanceView, number>> = { due: open.length, late: late.length };
  const onSearch = (patch: Partial<FinancesSearch>) => void navigate({ search: (prev) => ({ ...prev, ...patch }) });

  return (
    <Page
      title="Finances"
      actions={
        view === 'transactions' ? (
          <Button variant="secondary" icon={Plus} onClick={() => openCreate('transaction')}>
            Nouvelle transaction
          </Button>
        ) : (
          <Button variant="secondary" icon={Plus} onClick={() => openCreate('payment')}>
            Nouvel encaissement
          </Button>
        )
      }
    >
      {/* Les chiffres sont toujours là ; tant que les soldes de départ manquent, la question s'y ajoute. */}
      <FinanceFigures summary={summary} today={today} className="mb-16" />
      {needsInitialBalances && !later && <InitialBalances onLater={() => setLater(true)} />}

      <div className="mb-6">
        <SegmentedTabs
          tabs={FINANCE_VIEWS.map((v) => ({ value: v, label: FINANCE_VIEW_LABELS[v], count: counts[v] || undefined }))}
          value={view}
          onChange={(next) => void navigate({ search: (prev) => ({ ...prev, view: next === 'due' ? undefined : next }) })}
        />
      </div>

      {view === 'due' && (
        <PaymentList
          payments={open}
          today={today}
          empty="Rien à recevoir pour l’instant. Les échéances de tes projets apparaîtront ici."
          onOpen={setEditingPayment}
        />
      )}
      {view === 'late' && (
        <PaymentList payments={late} today={today} empty="Aucun paiement en retard." onOpen={setEditingPayment} />
      )}
      {view === 'received' && received.data && (
        <PaymentList
          payments={received.data}
          today={today}
          empty="Aucun encaissement reçu pour l’instant."
          onOpen={setEditingPayment}
        />
      )}
      {view === 'transactions' && (
        <TransactionsView search={search} onSearch={onSearch} today={today} onOpen={setEditingTransaction} />
      )}

      <PaymentDialog
        open={editingPayment !== null}
        onOpenChange={(next) => !next && setEditingPayment(null)}
        payment={editingPayment}
      />
      <TransactionDialog
        open={editingTransaction !== null}
        onOpenChange={(next) => !next && setEditingTransaction(null)}
        transaction={editingTransaction}
      />
    </Page>
  );
}
