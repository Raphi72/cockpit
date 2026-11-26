import { useRouterState } from '@tanstack/react-router';
import {
  ArrowRightLeft,
  BookOpen,
  CalendarPlus,
  FolderClosed,
  HandCoins,
  NotebookPen,
  Plus,
  Search,
  SquareCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, type KeyboardEvent } from 'react';
import { todayISO } from '@/core/dates';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { Kbd } from '@/ui/primitives/Kbd';
import { createDefaultsFor, useCreateStore, type CreateKind } from '../create-store';
import type { AppMode } from '../modes';
import { useUiStore } from '../ui-store';

type MenuEntry = { kind: CreateKind; key: string; label: string; icon: LucideIcon; separatorBefore?: boolean };

/** Le menu « Nouveau » de chaque mode (C, puis la lettre de la ligne). */
export const NEW_MENU: Record<AppMode, MenuEntry[]> = {
  work: [
    { kind: 'task', key: 'T', label: 'Nouvelle tâche', icon: SquareCheck },
    { kind: 'event', key: 'E', label: 'Nouvel événement', icon: CalendarPlus },
    { kind: 'project', key: 'P', label: 'Nouveau projet', icon: FolderClosed },
    { kind: 'client', key: 'L', label: 'Nouveau client', icon: User },
    { kind: 'payment', key: 'R', label: 'Nouvel encaissement', icon: HandCoins, separatorBefore: true },
    { kind: 'transaction', key: 'D', label: 'Nouvelle transaction', icon: ArrowRightLeft },
  ],
  school: [
    { kind: 'homework', key: 'D', label: 'Nouveau devoir', icon: NotebookPen },
    { kind: 'event', key: 'E', label: 'Nouvel événement', icon: CalendarPlus },
    { kind: 'subject', key: 'M', label: 'Nouvelle matière', icon: BookOpen, separatorBefore: true },
  ],
};

function NewMenu() {
  const open = useUiStore((state) => state.newMenuOpen);
  const setOpen = useUiStore((state) => state.setNewMenuOpen);
  const mode = useUiStore((state) => state.mode);
  const openCreate = useCreateStore((state) => state.openCreate);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const entries = NEW_MENU[mode];

  const create = (kind: CreateKind) => {
    setOpen(false);
    openCreate(kind, createDefaultsFor(kind, pathname, todayISO()));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const entry = entries.find((e) => e.key.toLowerCase() === event.key.toLowerCase());
    if (entry && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      create(entry.kind);
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
        {entries.map((entry) => (
          <Fragment key={entry.kind}>
            {entry.separatorBefore && <MenuSeparator />}
            <MenuItem icon={entry.icon} shortcut={entry.key} onSelect={() => create(entry.kind)}>
              {entry.label}
            </MenuItem>
          </Fragment>
        ))}
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
