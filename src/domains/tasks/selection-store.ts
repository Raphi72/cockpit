import { create } from 'zustand';

/** Attribut posé sur chaque ligne de tâche : l'ordre de la page sert à la sélection par plage. */
export const TASK_ROW_ATTRIBUTE = 'data-task-id';

type SelectionState = {
  ids: string[];
  /** Dernière ligne cliquée avec Ctrl : point de départ d'une plage (Maj+clic). */
  anchor: string | null;
  toggle: (id: string) => void;
  selectRange: (id: string) => void;
  clear: () => void;
};

/** Identifiants des lignes de tâche visibles, dans l'ordre de la page (sans doublon). */
function visibleTaskIds(): string[] {
  const ids = Array.from(document.querySelectorAll<HTMLElement>(`[${TASK_ROW_ATTRIBUTE}]`)).map(
    (el) => el.getAttribute(TASK_ROW_ATTRIBUTE) ?? '',
  );
  return [...new Set(ids)];
}

/**
 * Sélection de plusieurs tâches, comme dans l'Explorateur Windows : Ctrl+clic ajoute ou retire
 * une ligne, Maj+clic prend toutes les lignes entre la dernière cliquée et celle-ci.
 * La barre d'actions groupées apparaît dès qu'une tâche est sélectionnée.
 */
export const useTaskSelection = create<SelectionState>()((set, get) => ({
  ids: [],
  anchor: null,
  toggle: (id) =>
    set((state) => ({
      ids: state.ids.includes(id) ? state.ids.filter((x) => x !== id) : [...state.ids, id],
      anchor: id,
    })),
  selectRange: (id) => {
    const { anchor } = get();
    if (!anchor) return get().toggle(id);
    const rows = visibleTaskIds();
    const [from, to] = [rows.indexOf(anchor), rows.indexOf(id)];
    if (from === -1 || to === -1) return get().toggle(id);
    set({ ids: rows.slice(Math.min(from, to), Math.max(from, to) + 1) });
  },
  clear: () => set({ ids: [], anchor: null }),
}));
