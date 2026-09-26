import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CreateEventDialog } from '@/domains/agenda/components/CreateEventDialog';
import { EventSheet } from '@/domains/agenda/components/EventSheet';
import { ClientEditorDialog, CreateClientDialog } from '@/domains/clients/components/ClientDialog';
import { announceRestoreIfDone } from '@/domains/data';
import { CreatePaymentDialog, PaymentEditorDialog } from '@/domains/finance/payments/components/PaymentDialog';
import { ReceivePaymentDialog } from '@/domains/finance/payments/components/ReceivePaymentDialog';
import { CreateTransactionDialog, TransactionEditorDialog } from '@/domains/finance/transactions/components/TransactionDialog';
import { useNotificationScheduler } from '@/domains/notifications';
import { CreateProjectDialog } from '@/domains/projects/components/CreateProjectDialog';
import { CreateTaskDialog } from '@/domains/tasks/components/CreateTaskDialog';
import { SelectionBar } from '@/domains/tasks/components/SelectionBar';
import { TaskSheet } from '@/domains/tasks/components/TaskSheet';
import { CommandPalette } from '@/domains/search/components/CommandPalette';
import { Toaster } from '@/ui/overlays/Toaster';
import { usePreferencesSync } from '../preferences';
import { useGlobalShortcuts } from '../shortcuts';
import { useUiStore } from '../ui-store';
import { OverlaysBoundary } from './OverlaysBoundary';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  useGlobalShortcuts();
  useNotificationScheduler();
  usePreferencesSync();
  useEffect(announceRestoreIfDone, []);

  return (
    <div
      className="grid h-full"
      style={{ gridTemplateColumns: `${collapsed ? 56 : 232}px minmax(0, 1fr)` }}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Fenêtres globales, ouvrables depuis n'importe quelle page. Une erreur n'y emporte jamais toute l'app. */}
      <OverlaysBoundary>
        <CreateTaskDialog />
        <CreateEventDialog />
        <CreateProjectDialog />
        <CreateClientDialog />
        <CreatePaymentDialog />
        <CreateTransactionDialog />
        <ReceivePaymentDialog />
        <PaymentEditorDialog />
        <ClientEditorDialog />
        <TransactionEditorDialog />
        <TaskSheet />
        <EventSheet />
        <SelectionBar />
        <CommandPalette />
        <ShortcutsDialog />
      </OverlaysBoundary>
      <Toaster />
    </div>
  );
}
