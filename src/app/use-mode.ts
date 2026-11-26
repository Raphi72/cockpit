import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { modeOfPath, otherMode, type AppMode } from './modes';
import { useUiStore } from './ui-store';

/**
 * Passer dans un mode (l'autre, sans argument). Une page qui n'appartient qu'au mode quitté (Projets
 * en passant en Cours) laisse place à Aujourd'hui ; une page commune (calendrier…) reste affichée.
 */
export function useSwitchMode(): (next?: AppMode) => void {
  const navigate = useNavigate();
  const router = useRouter();
  return useCallback(
    (next?: AppMode) => {
      const { mode, setMode } = useUiStore.getState();
      const target = next ?? otherMode(mode);
      if (target === mode) return;
      setMode(target);
      const page = modeOfPath(router.state.location.pathname);
      if (page !== null && page !== target) void navigate({ to: '/' });
    },
    [navigate, router],
  );
}

/**
 * Le mode suit la page : ouvrir un projet depuis la recherche, en mode Cours, repasse en Travail, pour
 * que la barre latérale montre où l'on est. Seul un changement de page compte (pas un changement de mode).
 */
export function useModeFollowsPage(): void {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    const page = modeOfPath(pathname);
    const { mode, setMode } = useUiStore.getState();
    if (page !== null && page !== mode) setMode(page);
  }, [pathname]);
}
