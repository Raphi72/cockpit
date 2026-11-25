import type { KeyboardEvent } from 'react';
import { Button } from '../primitives/Button';
import { Dialog, DialogFooter } from './Dialog';

export type Choice = {
  label: string;
  /** Une ligne discrète sous le libellé : ce que ce choix fera. */
  hint?: string;
  onSelect: () => void;
};

type ChoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  choices: Choice[];
};

/** ↑ ↓ passent d'un choix à l'autre. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
  if (next) {
    event.preventDefault();
    next.focus();
  }
}

/**
 * Une question à quelques réponses (« cette fois » ou « toute la série »…) : le premier choix a le
 * focus, Entrée le valide, Échap ou « Annuler » ne fait rien.
 */
export function ChoiceDialog({ open, onOpenChange, title, description, choices }: ChoiceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} width={440}>
      <div className="mt-5 flex flex-col gap-1.5" onKeyDown={moveFocus}>
        {choices.map((choice, index) => (
          <button
            key={choice.label}
            type="button"
            autoFocus={index === 0}
            onClick={() => {
              choice.onSelect();
              onOpenChange(false);
            }}
            className={
              'flex min-h-11 flex-col justify-center rounded-md border border-line px-3.5 py-2 text-left outline-none ' +
              'transition-colors duration-[120ms] ease-soft hover:bg-hover focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft'
            }
          >
            <span className="font-medium">{choice.label}</span>
            {choice.hint && <span className="text-meta text-ink-3">{choice.hint}</span>}
          </button>
        ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Annuler
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
