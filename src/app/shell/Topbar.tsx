import { FolderClosed, Plus, User } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/ui/overlays/Menu';
import { Button } from '@/ui/primitives/Button';
import { useCreateStore, type CreateKind } from '../create-store';
import { useUiStore } from '../ui-store';

/** Lettres actives dans le menu « Nouveau » (C puis P, etc.). */
const MENU_KEYS: Record<string, CreateKind> = { p: 'project', l: 'client' };

function NewMenu() {
  const open = useUiStore((state) => state.newMenuOpen);
  const setOpen = useUiStore((state) => state.setNewMenuOpen);
  const openCreate = useCreateStore((state) => state.openCreate);

  const onKeyDown = (event: KeyboardEvent) => {
    const kind = MENU_KEYS[event.key.toLowerCase()];
    if (kind && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      setOpen(false);
      openCreate(kind);
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
        <MenuItem icon={FolderClosed} shortcut="P" onSelect={() => openCreate('project')}>
          Nouveau projet
        </MenuItem>
        <MenuItem icon={User} shortcut="L" onSelect={() => openCreate('client')}>
          Nouveau client
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
