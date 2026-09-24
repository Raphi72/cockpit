import { Command } from 'cmdk';
import { Plus, User } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { PropertyButton } from '@/ui/primitives/PropertyButton';
import { useClients } from '../hooks';
import type { ClientChoice } from '../model';

/** Recherche sans tenir compte des majuscules ni des accents. */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const itemClass =
  'flex h-8 cursor-default items-center gap-2.5 rounded-[6px] px-2 select-none data-[selected=true]:bg-hover';

type ClientPickerProps = {
  value: ClientChoice;
  onChange: (choice: ClientChoice) => void;
  variant?: 'field' | 'inline';
};

/** Choisir un client existant, ou le créer en tapant simplement son nom. */
export function ClientPicker({ value, onChange, variant = 'inline' }: ClientPickerProps) {
  const { data: clients = [] } = useClients();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const typed = search.trim();
  const exists = clients.some((c) => normalize(c.name) === normalize(typed));

  const choose = (choice: ClientChoice) => {
    onChange(choice);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <Popover.Trigger asChild>
        <PropertyButton variant={variant} aria-label="Client / organisation">
          {value.kind === 'none' ? (
            <span className="text-ink-3">Aucun client</span>
          ) : (
            <span className="truncate">
              {value.name}
              {value.kind === 'new' && <span className="ml-2 text-meta text-ink-3">nouveau</span>}
            </span>
          )}
        </PropertyButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[300px] rounded-lg bg-elevated p-1 shadow-overlay animate-pop focus:outline-none"
        >
          <Command
            loop
            filter={(itemValue, query, keywords) => {
              if (itemValue === '__create' || itemValue === '__none') return 1;
              return normalize((keywords ?? []).join(' ')).includes(normalize(query)) ? 1 : 0;
            }}
          >
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Chercher ou créer un client…"
              className="h-9 w-full border-b border-line bg-transparent px-2 outline-none placeholder:text-ink-3"
            />
            <Command.List className="max-h-64 overflow-y-auto pt-1">
              {typed === '' && (
                <Command.Item value="__none" onSelect={() => choose({ kind: 'none' })} className={itemClass}>
                  <span className="text-ink-2">Aucun client</span>
                </Command.Item>
              )}
              {clients.map((client) => (
                <Command.Item
                  key={client.id}
                  value={client.id}
                  keywords={[client.name]}
                  onSelect={() => choose({ kind: 'existing', id: client.id, name: client.name })}
                  className={itemClass}
                >
                  <User className="size-4 text-ink-3" strokeWidth={1.75} />
                  <span className="truncate">{client.name}</span>
                </Command.Item>
              ))}
              {typed !== '' && !exists && (
                <Command.Item
                  value="__create"
                  forceMount
                  onSelect={() => choose({ kind: 'new', name: typed })}
                  className={itemClass}
                >
                  <Plus className="size-4 text-ink-2" strokeWidth={1.75} />
                  <span className="truncate">Créer « {typed} »</span>
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
