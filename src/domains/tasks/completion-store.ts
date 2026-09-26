import { create } from 'zustand';

/**
 * Durée de l'animation quand on coche une tâche : la case se remplit, le titre se barre, puis la
 * ligne s'efface (voir `.task-leave` dans global.css). La tâche n'est terminée en base qu'à la fin :
 * recocher pendant l'animation l'annule, sans rien écrire.
 */
export const COMPLETE_DELAY_MS = 1200;

/** Dans le panneau d'une tâche, rien ne s'efface : juste le temps de voir la case et le titre. */
export const COMPLETE_IN_PANEL_DELAY_MS = 450;

type CompletingState = {
  /** Tâches en train d'être terminées (animation en cours). */
  ids: string[];
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useCompletingTasks = create<CompletingState>()(() => ({ ids: [] }));

const remove = (id: string) => useCompletingTasks.setState((state) => ({ ids: state.ids.filter((x) => x !== id) }));

export function isCompleting(id: string): boolean {
  return timers.has(id);
}

/**
 * Lance l'animation, puis `commit` à la fin. Le minuteur ne dépend d'aucun composant : changer de
 * page pendant l'animation ne perd pas la tâche cochée. La ligne garde son état (effacée) jusqu'à ce
 * que `commit` ait mis les listes à jour : elle ne réapparaît jamais un instant.
 */
export function startCompleting(id: string, delay: number, commit: () => Promise<void>): void {
  cancelCompleting(id);
  useCompletingTasks.setState((state) => ({ ids: [...state.ids, id] }));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void commit().finally(() => remove(id));
    }, delay),
  );
}

/** Recocher pendant l'animation : la tâche reste à faire. */
export function cancelCompleting(id: string): void {
  const timer = timers.get(id);
  if (timer === undefined) return;
  clearTimeout(timer);
  timers.delete(id);
  remove(id);
}
