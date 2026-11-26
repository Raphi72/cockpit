import { Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CreateEventDialog } from '@/domains/agenda/components/CreateEventDialog';
import { EventSheet } from '@/domains/agenda/components/EventSheet';
import { ClientEditorDialog, CreateClientDialog } from '@/domains/clients/components/ClientDialog';
import { announceRestoreIfDone } from '@/domains/data';
import { CreatePaymentDialog, PaymentEditorDialog } from '@/domains/finance/payments/components/PaymentDialog';
import { ReceivePaymentDialog } from '@/domains/finance/payments/components/ReceivePaymentDialog';
import { CreateTransactionDialog, TransactionEditorDialog } from '@/domains/finance/transactions/components/TransactionDialog';
import { useNotificationScheduler } from '@/domains/notifications';
import { usePresence } from '@/domains/presence';
import { CreateProjectDialog } from '@/domains/projects/components/CreateProjectDialog';
import { CreateTaskDialog } from '@/domains/tasks/components/CreateTaskDialog';
import { SelectionBar } from '@/domains/tasks/components/SelectionBar';
import { TaskSheet } from '@/domains/tasks/components/TaskSheet';
import { WorkPlanDialog } from '@/domains/tasks/components/WorkPlanDialog';
import { CommandPalette } from '@/domains/search/components/CommandPalette';
import { CreatePageOnDemand } from '@/domains/pages/components/CreatePageOnDemand';
import { WorkoutDialog } from '@/domains/habits/components/WorkoutDialog';
import { Companion } from '@/domains/companion/components/Companion';
import { GoogleEventDialog } from '@/domains/google/components/GoogleEventDialog';
import { useGoogleAutoSync } from '@/domains/google/hooks';
import { useAutoSync } from '@/domains/sync/hooks';
import { CreateSubjectDialog } from '@/domains/school/subjects/components/SubjectDialog';
import { CreateSlotDialog } from '@/domains/school/timetable/components/SlotDialog';
import { CreateExamDialog, ExamEditorDialog } from '@/domains/school/exams/components/ExamDialog';
import { CreateGradeDialog, GradeEditorDialog } from '@/domains/school/grades/components/GradeDialog';
import { RevisionPlanDialog } from '@/domains/school/exams/components/RevisionPlanDialog';
import { PageTransition } from '@/ui/motion/PageTransition';
import { Toaster } from '@/ui/overlays/Toaster';
import { usePreferencesSync } from '../preferences';
import { useGlobalShortcuts } from '../shortcuts';
import { useUiStore } from '../ui-store';
import { useModeFollowsPage } from '../use-mode';
import { OverlaysBoundary } from './OverlaysBoundary';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

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
        <CreateTaskDialog />
        <CreateEventDialog />
        <CreateProjectDialog />
        <CreateClientDialog />
        <CreateSubjectDialog />
        <CreateSlotDialog />
        <CreateExamDialog />
        <ExamEditorDialog />
        <CreateGradeDialog />
        <GradeEditorDialog />
        <CreatePageOnDemand />
        <RevisionPlanDialog />
        <WorkoutDialog />
        <CreatePaymentDialog />
        <CreateTransactionDialog />
        <ReceivePaymentDialog />
        <PaymentEditorDialog />
        <ClientEditorDialog />
        <TransactionEditorDialog />
        <WorkPlanDialog />
        <TaskSheet />
        <EventSheet />
        <GoogleEventDialog />
        <SelectionBar />
        <CommandPalette />
        <ShortcutsDialog />
        {/* Le compagnon : écran du matin, mode focus, célébrations, sons. */}
        <Companion />
      </OverlaysBoundary>
      <Toaster />
    </div>
  );
}
