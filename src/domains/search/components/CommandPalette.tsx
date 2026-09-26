import { isTauri } from '@tauri-apps/api/core';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Command } from 'cmdk';
import {
  ArrowRightLeft,
  CalendarDays,
  Circle,
  CircleCheck,
  FolderClosed,
  HandCoins,
  Lightbulb,
  Search,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { createDefaultsFor, useCreateStore } from '@/app/create-store';
import { useUiStore } from '@/app/ui-store';
import { relativeDateLabel } from '@/core/dates';
import { formatMoney, formatSignedMoney } from '@/core/money';
import { useToday } from '@/core/use-today';
import { useEventSheet } from '@/domains/agenda/event-sheet-store';
import { useClientEditor } from '@/domains/clients/editor-store';
import { useBackupNow } from '@/domains/data';
import { usePaymentEditor } from '@/domains/finance/payments/editor-store';
import { useOpenPayments } from '@/domains/finance/payments/hooks';
import { PaymentDate } from '@/domains/finance/payments/components/PaymentRow';
import { paymentContext, type PaymentListItem } from '@/domains/finance/payments/model';
import { useReceiveDialog } from '@/domains/finance/payments/receive-store';
import { useTransactionEditor } from '@/domains/finance/transactions/editor-store';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { ColorDot, type PaletteKey } from '@/ui/data/ColorDot';
import { WindowErrorBoundary } from '@/ui/overlays/WindowErrorBoundary';
import { Kbd } from '@/ui/primitives/Kbd';
import { COMMAND_GROUP_LABELS, filterCommands, paletteCommands, type PaletteAction, type PaletteCommand } from '../commands';
import { useSearch } from '../hooks';
import { groupResults, matchesAllTerms, searchTerms, type SearchEntity, type SearchResult } from '../model';

const itemClass =
  'flex h-10 cursor-default items-center gap-3 rounded-md px-2.5 select-none data-[selected=true]:bg-hover';

const groupClass =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 ' +
  '[&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3';

const ENTITY_ICONS: Record<SearchEntity, LucideIcon> = {
  project: FolderClosed,
  task: Circle,
  idea: Lightbulb,
  client: User,
  event: CalendarDays,
  payment: HandCoins,
  transaction: ArrowRightLeft,
};

function ItemIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />;
}

/** « aujourd'hui », « demain », « 10 oct. » ; un rendez-vous garde son heure. */
function dateLabel(date: string, today: string): string {
  const day = relativeDateLabel(date.slice(0, 10), today);
  return date.length > 10 ? `${day} ${date.slice(11, 16)}` : day;
}

function resultDetail(result: SearchResult, today: string): string | null {
  if (result.entity === 'payment' && result.amountCents !== null) return formatMoney(result.amountCents);
  if (result.entity === 'transaction' && result.amountCents !== null) return formatSignedMoney(result.amountCents);
  if (result.entity === 'client' || !result.date) return null;
  return dateLabel(result.date, today);
}

function ResultItem({ result, today, onSelect }: { result: SearchResult; today: string; onSelect: () => void }) {
  const detail = resultDetail(result, today);
  const icon = result.entity === 'task' && result.closed ? CircleCheck : ENTITY_ICONS[result.entity];
  return (
    <Command.Item value={`${result.entity}:${result.id}`} onSelect={onSelect} className={itemClass}>
      {result.entity === 'project' && result.color ? (
        <span className="grid size-4 shrink-0 place-items-center">
          <ColorDot color={result.color as PaletteKey} />
        </span>
      ) : (
        <ItemIcon icon={icon} />
      )}
      <span className={`min-w-0 truncate ${result.closed ? 'text-ink-3' : ''}`}>{result.title}</span>
      {result.context && <span className="min-w-0 shrink-[2] truncate text-meta text-ink-3">{result.context}</span>}
      {detail && <span className="tnum ml-auto shrink-0 pl-3 text-meta text-ink-3">{detail}</span>}
    </Command.Item>
  );
}

function CommandItem({ command, onSelect }: { command: PaletteCommand; onSelect: () => void }) {
  return (
    <Command.Item value={command.id} onSelect={onSelect} className={itemClass}>
      <ItemIcon icon={command.icon} />
      <span className="truncate">{command.label}</span>
      {command.shortcut && (
        <span className="ml-auto">
          <Kbd>{command.shortcut}</Kbd>
        </span>
      )}
    </Command.Item>
  );
}

function ReceiveItem({ payment, today, onSelect }: { payment: PaymentListItem; today: string; onSelect: () => void }) {
  const context = paymentContext(payment);
  return (
    <Command.Item value={`receive:${payment.id}`} onSelect={onSelect} className={itemClass}>
      {payment.projectColor ? (
        <span className="grid size-4 shrink-0 place-items-center">
          <ColorDot color={payment.projectColor} />
        </span>
      ) : (
        <ItemIcon icon={HandCoins} />
      )}
      <span className="min-w-0 truncate">{payment.label}</span>
      {context && <span className="min-w-0 shrink-[2] truncate text-meta text-ink-3">{context}</span>}
      <span className="tnum ml-auto flex shrink-0 items-center gap-4 pl-3 text-meta">
        <PaymentDate payment={payment} today={today} />
        <span className="text-ink">{formatMoney(payment.amountCents)}</span>
      </span>
    </Command.Item>
  );
}

type Mode = 'root' | 'receive';

/** Ce que fait un choix dans la palette : ouvrir une source, lancer une commande. */
function usePaletteActions(close: () => void) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const today = useToday();
  const openCreate = useCreateStore((state) => state.openCreate);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const openTask = useTaskSheet((state) => state.openTask);
  const openEvent = useEventSheet((state) => state.openEvent);
  const openPayment = usePaymentEditor((state) => state.openPayment);
  const openClient = useClientEditor((state) => state.openClient);
  const openTransaction = useTransactionEditor((state) => state.openTransaction);
  const openReceive = useReceiveDialog((state) => state.openReceive);
  const backupNow = useBackupNow();

  const openResult = (result: SearchResult) => {
    close();
    switch (result.entity) {
      case 'project':
        void navigate({ to: '/projects/$projectId', params: { projectId: result.id } });
        break;
      case 'task':
        openTask(result.id);
        break;
      case 'idea':
        if (result.projectId) void navigate({ to: '/projects/$projectId', params: { projectId: result.projectId } });
        break;
      case 'event':
        openEvent(result.id);
        break;
      case 'payment':
        openPayment(result.id);
        break;
      case 'client':
        openClient(result.id);
        break;
      case 'transaction':
        openTransaction(result.id);
        break;
    }
  };

  const runAction = (action: Exclude<PaletteAction, { type: 'receive' }>) => {
    close();
    switch (action.type) {
      case 'create':
        openCreate(action.kind, createDefaultsFor(action.kind, pathname, today));
        break;
      case 'go':
        void navigate({ to: action.to });
        break;
      case 'shortcuts':
        setShortcutsOpen(true);
        break;
      case 'sidebar':
        toggleSidebar();
        break;
      case 'backup':
        backupNow.mutate();
        break;
    }
  };

  const receive = (payment: PaymentListItem) => {
    close();
    openReceive(payment);
  };

  return { openResult, runAction, receive };
}

function PaletteBody({ close }: { close: () => void }) {
  const today = useToday();
  const [mode, setMode] = useState<Mode>('root');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const { openResult, runAction, receive } = usePaletteActions(close);

  const searching = mode === 'root' && searchTerms(query).length > 0;
  const { data: results = [], isFetching } = useSearch(searching ? query : '', today);
  const { data: openPayments = [] } = useOpenPayments();

  const commands = useMemo(
    () => filterCommands(paletteCommands({ desktop: isTauri(), sidebarCollapsed }), query),
    [query, sidebarCollapsed],
  );
  const groups = useMemo(() => (searching ? groupResults(results) : []), [searching, results]);
  const payments = useMemo(
    () =>
      mode === 'receive'
        ? openPayments.filter((p) => matchesAllTerms(`${p.label} ${paymentContext(p) ?? ''} ${p.invoiceRef ?? ''}`, query))
        : [],
    [mode, openPayments, query],
  );

  // La sélection revient sur le premier élément dès que la liste change (frappe, résultats arrivés).
  const values =
    mode === 'receive'
      ? payments.map((p) => `receive:${p.id}`)
      : [...commands.map((c) => c.id), ...groups.flatMap((g) => g.results.map((r) => `${r.entity}:${r.id}`))];
  const valuesKey = values.join('|');
  useEffect(() => {
    setSelected(valuesKey.split('|')[0] ?? '');
  }, [valuesKey]);

  const select = (command: PaletteCommand) => {
    if (command.action.type === 'receive') {
      setMode('receive');
      setQuery('');
    } else {
      runAction(command.action);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Retour arrière dans un champ vide : on revient à la liste principale.
    if (event.key === 'Backspace' && mode !== 'root' && query === '') {
      event.preventDefault();
      setMode('root');
    }
  };

  const byGroup = (group: PaletteCommand['group']) => commands.filter((c) => c.group === group);

  return (
    <Command shouldFilter={false} loop value={selected} onValueChange={setSelected} onKeyDown={onKeyDown}>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
        {mode === 'receive' && (
          <span className="shrink-0 rounded-sm bg-active px-1.5 py-0.5 text-meta text-ink-2">Marquer reçu</span>
        )}
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={mode === 'receive' ? 'Quel encaissement ?' : 'Rechercher ou lancer une commande…'}
          className="h-12 min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
        />
      </div>

      <Command.List className="max-h-[min(440px,62vh)] overflow-y-auto p-1.5 scroll-py-1.5">
        {mode === 'receive' ? (
          <>
            <Command.Empty className="px-2.5 py-6 text-center text-ink-2">
              {openPayments.length === 0 ? 'Aucun encaissement en attente.' : 'Aucun encaissement ne correspond.'}
            </Command.Empty>
            {payments.map((payment) => (
              <ReceiveItem key={payment.id} payment={payment} today={today} onSelect={() => receive(payment)} />
            ))}
          </>
        ) : (
          <>
            {searching && !isFetching && (
              <Command.Empty className="px-2.5 py-6 text-center text-ink-2">
                Aucun résultat pour « {query.trim()} ».
              </Command.Empty>
            )}
            {searching ? (
              commands.length > 0 && (
                <Command.Group heading="Commandes" className={groupClass}>
                  {commands.map((command) => (
                    <CommandItem key={command.id} command={command} onSelect={() => select(command)} />
                  ))}
                </Command.Group>
              )
            ) : (
              (['create', 'action', 'go'] as const).map(
                (group) =>
                  byGroup(group).length > 0 && (
                    <Command.Group key={group} heading={COMMAND_GROUP_LABELS[group]} className={groupClass}>
                      {byGroup(group).map((command) => (
                        <CommandItem key={command.id} command={command} onSelect={() => select(command)} />
                      ))}
                    </Command.Group>
                  ),
              )
            )}
            {groups.map((group) => (
              <Command.Group key={group.entity} heading={group.label} className={groupClass}>
                {group.results.map((result) => (
                  <ResultItem key={result.id} result={result} today={today} onSelect={() => openResult(result)} />
                ))}
              </Command.Group>
            ))}
          </>
        )}
      </Command.List>
    </Command>
  );
}

/** Palette Ctrl+K : chercher dans toutes les données et lancer une commande, au même endroit. */
export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const setOpen = useUiStore((state) => state.setPaletteOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade bg-backdrop" />
        <Dialog.Content
          aria-describedby={undefined}
          // Le choix ouvre souvent une autre fenêtre : ne pas lui reprendre le focus en fermant.
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-x-0 top-[12vh] z-50 mx-auto overflow-hidden rounded-xl bg-elevated shadow-overlay animate-pop focus:outline-none"
          style={{ width: 'min(620px, calc(100vw - 32px))' }}
        >
          <Dialog.Title className="sr-only">Rechercher ou lancer une commande</Dialog.Title>
          {open && (
            <WindowErrorBoundary onClose={() => setOpen(false)} className="p-6">
              <PaletteBody close={() => setOpen(false)} />
            </WindowErrorBoundary>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
