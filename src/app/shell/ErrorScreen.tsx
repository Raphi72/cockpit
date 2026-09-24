import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { PageContainer } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';

/**
 * Filet de sécurité : si une page plante, le reste de l'app (barre latérale, données) reste utilisable.
 * Aucune donnée n'est perdue : tout ce qui a été enregistré est déjà dans la base.
 */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <PageContainer>
      <TriangleAlert className="mb-3 size-5 text-danger" strokeWidth={1.75} />
      <h1 className="font-semibold">Cette page a rencontré un problème</h1>
      <p className="mt-1.5 max-w-lg text-ink-2">
        Tes données ne sont pas touchées. Tu peux réessayer ou revenir à l’accueil.
      </p>
      <p className="mt-3 max-w-lg font-mono text-meta text-ink-3 select-text">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" onClick={() => reset()}>
          Réessayer
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            reset();
            void router.navigate({ to: '/' });
          }}
        >
          Revenir à l’accueil
        </Button>
      </div>
    </PageContainer>
  );
}
