import { TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../primitives/Button';

type WindowErrorBoundaryProps = {
  children: ReactNode;
  /** Ferme la fenêtre ou le panneau. */
  onClose: () => void;
  /** Marges du message, selon la fenêtre (la palette n'a pas de marge intérieure). */
  className?: string;
};

/**
 * Une erreur dans une fenêtre (création, panneau de tâche…) reste dans cette fenêtre : le reste de l'app
 * continue. Rien n'est perdu, tout ce qui a été enregistré est déjà dans la base. La fenêtre rouverte
 * repart de zéro (son contenu est démonté à la fermeture).
 */
export class WindowErrorBoundary extends Component<WindowErrorBoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur dans une fenêtre :', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className={this.props.className ?? 'mt-4'}>
        <TriangleAlert className="mb-3 size-5 text-danger" strokeWidth={1.75} />
        <p className="font-semibold">Cette fenêtre a rencontré un problème</p>
        <p className="mt-1.5 text-ink-2">Tes données ne sont pas touchées. Ferme-la, puis réessaie.</p>
        <p className="mt-3 font-mono text-meta break-words text-ink-3 select-text">{error.message}</p>
        <Button variant="primary" className="mt-6" onClick={this.props.onClose}>
          Fermer
        </Button>
      </div>
    );
  }
}
