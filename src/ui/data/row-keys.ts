import type { KeyboardEvent } from 'react';

/** Lignes parcourables au clavier : tout élément marqué `data-row`, dans l'ordre de la page. */
const ROW_SELECTOR = '[data-row]';

function siblingRow(current: HTMLElement, direction: 1 | -1): HTMLElement | undefined {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(ROW_SELECTOR));
  const index = rows.indexOf(current);
  return index === -1 ? undefined : rows[index + direction];
}

type RowActions = {
  open: () => void;
  /** Espace : cocher (tâches). */
  toggle?: () => void;
  /** Suppr : supprimer, avec « Annuler » dans le toast. */
  remove?: () => void;
};

/**
 * Clavier d'une ligne de liste (à poser avec `data-row` et `tabIndex={0}`) :
 * ↑ ↓ passent à la ligne voisine, Entrée ouvre, Espace coche, Suppr supprime.
 * Après une suppression, le focus reste dans la liste, sur la ligne suivante.
 */
export function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, actions: RowActions): void {
  if (event.target !== event.currentTarget || event.ctrlKey || event.altKey || event.metaKey) return;
  const row = event.currentTarget;
  switch (event.key) {
    case 'Enter':
      event.preventDefault();
      actions.open();
      break;
    case ' ':
      if (!actions.toggle) return;
      event.preventDefault();
      actions.toggle();
      break;
    case 'Delete':
      if (!actions.remove) return;
      event.preventDefault();
      (siblingRow(row, 1) ?? siblingRow(row, -1))?.focus();
      actions.remove();
      break;
    case 'ArrowDown':
    case 'ArrowUp':
      event.preventDefault();
      siblingRow(row, event.key === 'ArrowDown' ? 1 : -1)?.focus();
      break;
  }
}
