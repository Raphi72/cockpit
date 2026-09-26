import { Archive, Plus } from 'lucide-react';
import { useState } from 'react';
import { formatMoney } from '@/core/money';
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { toast } from '@/ui/overlays/toast';
import { Button } from '@/ui/primitives/Button';
import { ChoiceChips } from '@/ui/primitives/ChoiceChips';
import { InlineText } from '@/ui/primitives/InlineFields';
import { Input } from '@/ui/primitives/Input';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useArchiveAccount, useCreateAccount, useManagedAccounts, useUpdateAccount } from '../hooks';
import { ACCOUNT_KIND_LABELS, archiveBlocker, type AccountKind, type ManagedAccount } from '../model';

const KINDS: AccountKind[] = ['business', 'personal'];

function KindMenu({ value, onChange }: { value: AccountKind; onChange: (kind: AccountKind) => void }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton aria-label="Type de compte">{ACCOUNT_KIND_LABELS[value]}</PropertyButton>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={value} onValueChange={(v) => onChange(v as AccountKind)}>
          {KINDS.map((kind) => (
            <MenuRadioItem key={kind} value={kind}>
              {ACCOUNT_KIND_LABELS[kind]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

function AddAccount() {
  const createAccount = useCreateAccount();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('business');

  if (!adding) {
    return (
      <Button variant="ghost" icon={Plus} className="mt-1 -ml-3" onClick={() => setAdding(true)}>
        Ajouter un compte
      </Button>
    );
  }
  const close = () => {
    setAdding(false);
    setName('');
  };
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return close();
        createAccount.mutate({ name: trimmed, kind }, { onSuccess: close });
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && close()}
        placeholder="Nom du compte"
        aria-label="Nom du nouveau compte"
        className="max-w-64"
      />
      <ChoiceChips
        label="Type du nouveau compte"
        options={KINDS.map((value) => ({ value, label: ACCOUNT_KIND_LABELS[value] }))}
        value={kind}
        onChange={setKind}
      />
      <Button type="submit" variant="secondary">
        Ajouter
      </Button>
      <Button variant="ghost" onClick={close}>
        Annuler
      </Button>
    </form>
  );
}

function ActiveAccount({ account, activeCount }: { account: ManagedAccount; activeCount: number }) {
  const updateAccount = useUpdateAccount();
  const archiveAccount = useArchiveAccount();
  const archive = () => {
    const blocker = archiveBlocker(account, activeCount);
    if (blocker) toast(blocker, { tone: 'danger' });
    else archiveAccount.mutate({ account, archived: true });
  };
  return (
    <li className="group grid min-h-10 grid-cols-[minmax(0,1fr)_150px_120px_32px] items-center gap-3">
      <InlineText
        value={account.name}
        onSave={(name) => updateAccount.mutate({ id: account.id, patch: { name } })}
        required
        aria-label={`Nom du compte ${account.name}`}
      />
      <KindMenu value={account.kind} onChange={(kind) => updateAccount.mutate({ id: account.id, patch: { kind } })} />
      <span className="tnum text-right text-meta text-ink-2">{formatMoney(account.balanceCents)}</span>
      <Button
        variant="ghost"
        icon={Archive}
        aria-label={`Archiver le compte ${account.name}`}
        title="Archiver"
        onClick={archive}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      />
    </li>
  );
}

/**
 * Paramètres › Comptes : renommer (clic sur le nom), changer le type, ajouter, archiver.
 * Un compte archivé garde ses transactions ; il sort des soldes et des formulaires.
 */
export function AccountsEditor() {
  const { data: accounts } = useManagedAccounts();
  const archiveAccount = useArchiveAccount();
  if (!accounts) return null;
  const active = accounts.filter((account) => account.archivedAt === null);
  const archived = accounts.filter((account) => account.archivedAt !== null);

  return (
    <div>
      <ul>
        {active.map((account) => (
          <ActiveAccount key={account.id} account={account} activeCount={active.length} />
        ))}
      </ul>
      <AddAccount />

      {archived.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 text-meta font-medium text-ink-2">Archivés</h3>
          <ul>
            {archived.map((account) => (
              <li key={account.id} className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="truncate text-ink-2">
                  {account.name}
                  <span className="ml-2 text-meta text-ink-3">
                    {account.transactionCount === 0
                      ? 'aucune transaction'
                      : `${account.transactionCount} transaction${account.transactionCount > 1 ? 's' : ''}`}
                  </span>
                </span>
                <Button variant="ghost" onClick={() => archiveAccount.mutate({ account, archived: false })}>
                  Réactiver
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
