import { Popover as RadixPopover } from 'radix-ui';
import type { ComponentProps } from 'react';

/** Petite fenêtre flottante ancrée à un bouton (choix d'une date…). Même habillage que les menus. */
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export function PopoverContent({
  children,
  align = 'center',
  className = '',
  ...props
}: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={8}
        className={`z-50 min-w-[220px] rounded-lg bg-elevated p-1 shadow-overlay animate-pop focus:outline-none ${className}`}
        {...props}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
