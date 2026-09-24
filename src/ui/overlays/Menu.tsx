import { Check, type LucideIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

/** Menus déroulants (Radix) : navigation au clavier, focus rendu au déclencheur à la fermeture. */
export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuContent({
  children,
  align = 'start',
  className = '',
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className={`z-50 min-w-[220px] rounded-lg bg-elevated p-1 shadow-overlay animate-pop focus:outline-none ${className}`}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

const itemClass =
  'flex h-8 cursor-default items-center gap-2.5 rounded-[6px] px-2 outline-none select-none ' +
  'data-[disabled]:opacity-40 data-[highlighted]:bg-hover';

type MenuItemProps = ComponentProps<typeof DropdownMenu.Item> & {
  icon?: LucideIcon;
  leading?: ReactNode;
  shortcut?: string;
  tone?: 'default' | 'danger';
};

export function MenuItem({ icon: Icon, leading, shortcut, tone = 'default', children, className = '', ...props }: MenuItemProps) {
  return (
    <DropdownMenu.Item className={`${itemClass} ${tone === 'danger' ? 'text-danger' : ''} ${className}`} {...props}>
      {Icon && <Icon className={`size-4 ${tone === 'danger' ? '' : 'text-ink-2'}`} strokeWidth={1.75} />}
      {leading}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && (
        <kbd className="rounded-sm border border-line px-[5px] py-[2px] font-sans text-[11px] leading-none text-ink-3">
          {shortcut}
        </kbd>
      )}
    </DropdownMenu.Item>
  );
}

type MenuRadioItemProps = ComponentProps<typeof DropdownMenu.RadioItem> & { leading?: ReactNode };

export function MenuRadioItem({ leading, children, className = '', ...props }: MenuRadioItemProps) {
  return (
    <DropdownMenu.RadioItem className={`${itemClass} ${className}`} {...props}>
      {leading}
      <span className="flex-1 truncate">{children}</span>
      <DropdownMenu.ItemIndicator>
        <Check className="size-4 text-ink-2" strokeWidth={1.75} />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  );
}

type MenuCheckboxItemProps = ComponentProps<typeof DropdownMenu.CheckboxItem>;

/** Option à cocher ; le menu reste ouvert pour en cocher plusieurs. */
export function MenuCheckboxItem({ children, className = '', onSelect, ...props }: MenuCheckboxItemProps) {
  return (
    <DropdownMenu.CheckboxItem
      className={`${itemClass} ${className}`}
      onSelect={(event) => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      <span className="grid size-4 shrink-0 place-items-center">
        <DropdownMenu.ItemIndicator>
          <Check className="size-4 text-ink-2" strokeWidth={1.75} />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="flex-1 truncate">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2 pt-2 pb-1 text-meta text-ink-3">{children}</DropdownMenu.Label>;
}
