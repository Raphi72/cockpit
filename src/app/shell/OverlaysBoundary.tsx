import { Component, Fragment, type ReactNode } from 'react';
import { useEventSheet } from '@/domains/agenda/event-sheet-store';
import { useTaskSheet } from '@/domains/tasks/sheet-store';
import { toast } from '@/ui/overlays/toast';
import { useCreateStore } from '../create-store';
import { useUiStore } from '../ui-store';

/** Une nouvelle erreur aussi vite après la précédente : on n'insiste pas. */
const REPEAT_MS = 2000;

/**
 * Dernier filet des fenêtres globales (création, panneaux, palette…). Chacune affiche déjà ses erreurs
 * dans sa propre fenêtre ; celle-ci rattrape le reste, pour que jamais une fenêtre ne remplace toute
 * l'app par l'écran d'erreur : les fenêtres se ferment, un message l'explique, la page reste là.
 */
export class OverlaysBoundary extends Component<{ children: ReactNode }, { failed: boolean; generation: number }> {
  state = { failed: false, generation: 0 };
  private lastFailure = 0;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Erreur dans une fenêtre globale :', error);
    const message = error instanceof Error ? error.message : String(error);
    toast(`Une fenêtre a rencontré un problème et s’est fermée (${message}). Tes données ne sont pas touchées.`, {
      tone: 'danger',
    });
    useCreateStore.getState().close();
    useTaskSheet.getState().close();
    useEventSheet.getState().close();
    useUiStore.getState().setPaletteOpen(false);
    useUiStore.getState().setShortcutsOpen(false);

    const now = Date.now();
    const repeated = now - this.lastFailure < REPEAT_MS;
    this.lastFailure = now;
    // Les fenêtres reviennent, fermées. Si l'erreur se reproduit aussitôt, elles restent absentes
    // jusqu'au prochain démarrage plutôt que de boucler.
    if (!repeated) this.setState((state) => ({ failed: false, generation: state.generation + 1 }));
  }

  render() {
    if (this.state.failed) return null;
    return <Fragment key={this.state.generation}>{this.props.children}</Fragment>;
  }
}
