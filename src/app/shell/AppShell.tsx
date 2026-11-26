import { Outlet, useRouterState } from '@tanstack/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { announceRestoreIfDone } from '@/domains/data';
import { useNotificationScheduler } from '@/domains/notifications';
import { usePresence } from '@/domains/presence';
import { useGoogleAutoSync } from '@/domains/google/hooks';
import { useAutoSync } from '@/domains/sync/hooks';
import { PageTransition } from '@/ui/motion/PageTransition';
import { Toaster } from '@/ui/overlays/Toaster';
import { usePreferencesSync } from '../preferences';
import { useGlobalShortcuts } from '../shortcuts';
import { useUiStore } from '../ui-store';
import { useModeFollowsPage } from '../use-mode';
import { OverlaysBoundary } from './OverlaysBoundary';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// Les fenêtres globales, dans leur propre morceau : chargées juste après le premier affichage.
const Overlays = lazy(() => import('./Overlays').then((module) => ({ default: module.Overlays })));

export function AppShell() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  // La page seule, sans ses filtres : changer de mois ou d'onglet ne rejoue pas le fondu.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Aujourd'hui change de contenu avec le mode : le fondu se rejoue aussi quand on change de mode.
  const mode = useUiStore((state) => state.mode);
  const pageKey = pathname === '/' ? `/:${mode}` : pathname;
  useGlobalShortcuts();
  useModeFollowsPage();
  useNotificationScheduler();
  usePresence();
  // Google Agenda : relu au lancement puis toutes les 15 minutes, s'il est connecté.
  useGoogleAutoSync();
  // Synchronisation entre appareils : chaque minute et à la fermeture de la fenêtre, si elle est activée.
  useAutoSync();
  usePreferencesSync();
  useEffect(announceRestoreIfDone, []);

  return (
    <div
      // La barre latérale se replie en glissant (coupé par « Réduire les animations », voir global.css).
      className="grid h-full transition-[grid-template-columns] duration-[180ms] ease-soft"
      style={{ gridTemplateColumns: `${collapsed ? 56 : 232}px minmax(0, 1fr)` }}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-auto">
          <PageTransition pageKey={pageKey}>
            <Outlet />
          </PageTransition>
        </main>
      </div>

      {/* Fenêtres globales, ouvrables depuis n'importe quelle page. Une erreur n'y emporte jamais toute l'app. */}
      <OverlaysBoundary>
        <Suspense fallback={null}>
          <Overlays />
        </Suspense>
      </OverlaysBoundary>
      <Toaster />
    </div>
  );
}
