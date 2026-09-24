import { useRouterState } from '@tanstack/react-router';
import { ArrowRightLeft, FolderClosed, HandCoins, Plus, SquareCheck, User } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { todayISO } from '@/core/dates';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { defaultsFromPath, useCreateStore, type CreateKind } from '../create-store';
import { useUiStore } from '../ui-store';

/** Lettres actives dans le menu « Nouveau » (C puis T, P, L, R ou D). */
const MENU_KEYS: Record<string, CreateKind> = { t: 'task', p: 'project', l: 'client', r: 'payment', d: 'transaction' };

/** Ces créations reprennent le projet de la fiche ouverte. */
const PROJECT_AWARE: CreateKind[] = ['task', 'payment', 'transaction'];

function NewMenu() {
  const open = useUiStore((state) => state.newMenuOpen);
  const setOpen = useUiStore((state) => state.setNewMenuOpen);
  const openCreate = useCreateStore((state) => state.openCreate);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const create = (kind: CreateKind) => {
    setOpen(false);
    openCreate(kind, PROJECT_AWARE.includes(kind) ? defaultsFromPath(pathname, todayISO()) : {});
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

export function Topbar() {
  return (
    <header className="shrink-0 border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-end gap-2 px-12">
        <NewMenu />
      </div>
    </header>
  );
}
