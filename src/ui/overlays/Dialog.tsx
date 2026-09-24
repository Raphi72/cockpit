import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  width?: number;
  /**
   * Rendre le focus à l'élément d'origine à la fermeture (par défaut).
   * Désactivé pour les créations : le focus reviendrait sur « Nouveau », qu'une touche
   * encore enfoncée (Entrée) pourrait rouvrir.
   */
  restoreFocus?: boolean;
  children: ReactNode;
};

/** Fenêtre modale : centrée en haut de l'écran, fermée par Échap ou un clic à côté. */
export function Dialog({ open, onOpenChange, title, description, width = 540, restoreFocus = true, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade bg-backdrop" />
        <RadixDialog.Content
          onCloseAutoFocus={restoreFocus ? undefined : (event) => event.preventDefault()}
          className="fixed inset-x-0 top-[10vh] z-50 mx-auto max-h-[80vh] overflow-y-auto rounded-xl bg-elevated p-6 shadow-overlay animate-pop focus:outline-none"
          style={{ width: `min(${width}px, calc(100vw - 32px))` }}
        >
          <RadixDialog.Title className="text-[16px] font-semibold tracking-tight">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-1 text-ink-2">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Pied de fenêtre : actions alignées à droite. */
export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-7 flex items-center justify-end gap-2">{children}</div>;
}
