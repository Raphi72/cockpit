import { useRouterState } from '@tanstack/react-router';
import { ArrowRightLeft, CalendarPlus, FolderClosed, HandCoins, Plus, Search, SquareCheck, User } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { todayISO } from '@/core/dates';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { Kbd } from '@/ui/primitives/Kbd';
import { createDefaultsFor, useCreateStore, type CreateKind } from '../create-store';
import { useUiStore } from '../ui-store';

/** Lettres actives dans le menu « Nouveau » (C puis T, E, P, L, R ou D). */
const MENU_KEYS: Record<string, CreateKind> = {
  t: 'task',
  e: 'event',
  p: 'project',
  l: 'client',
  r: 'payment',
  d: 'transaction',
};

function NewMenu() {
  const open = useUiStore((state) => state.newMenuOpen);
  const setOpen = useUiStore((state) => state.setNewMenuOpen);
  const openCreate = useCreateStore((state) => state.openCreate);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const create = (kind: CreateKind) => {
    setOpen(false);
    openCreate(kind, createDefaultsFor(kind, pathname, todayISO()));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const kind = MENU_KEYS[event.key.toLowerCase()];
    if (kind && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      create(kind);
    }
  };

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <Button variant="primary" icon={Plus} shortcut="C">
          Nouveau
        </Button>
      </MenuTrigger>
      <MenuContent align="end" onKeyDown={onKeyDown}>
        <MenuItem icon={SquareCheck} shortcut="T" onSelect={() => create('task')}>
          Nouvelle tâche
        </MenuItem>
        <MenuItem icon={CalendarPlus} shortcut="E" onSelect={() => create('event')}>
          Nouvel événement
        </MenuItem>
        <MenuItem icon={FolderClosed} shortcut="P" onSelect={() => create('project')}>
          Nouveau projet
        </MenuItem>
        <MenuItem icon={User} shortcut="L" onSelect={() => create('client')}>
          Nouveau client
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={HandCoins} shortcut="R" onSelect={() => create('payment')}>
          Nouvel encaissement
        </MenuItem>
        <MenuItem icon={ArrowRightLeft} shortcut="D" onSelect={() => create('transaction')}>
          Nouvelle transaction
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Ouvre la palette Ctrl+K : la recherche reste visible sans occuper de place. */
function SearchButton() {
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  return (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      className="-ml-2.5 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-ink-3 transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink-2"
    >
      <Search className="size-4" strokeWidth={1.75} />
      <span>Rechercher</span>
      <Kbd>Ctrl K</Kbd>
    </button>
  );
}

export function Topbar() {
  return (
    <header className="shrink-0 border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-2 px-12">
        <SearchButton />
        <NewMenu />
      </div>
    </header>
  );
}
