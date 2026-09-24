import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@/ui/overlays/Menu';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import type { Account } from '../model';

type AccountMenuProps = {
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
  variant?: 'field' | 'inline';
  'aria-label'?: string;
};

/** Choix d'un compte (transaction, réception d'un encaissement). */
export function AccountMenu({ accounts, value, onChange, variant = 'field', ...aria }: AccountMenuProps) {
  const selected = accounts.find((a) => a.id === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <PropertyButton variant={variant} aria-label={aria['aria-label'] ?? 'Compte'}>
          {selected ? <span className="truncate">{selected.name}</span> : undefined}
        </PropertyButton>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup value={value ?? undefined} onValueChange={onChange}>
          {accounts.map((account) => (
            <MenuRadioItem key={account.id} value={account.id}>
              {account.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
