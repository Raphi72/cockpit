import { Outlet } from '@tanstack/react-router';
import { CreateClientDialog } from '@/domains/clients/components/ClientDialog';
import { CreateProjectDialog } from '@/domains/projects/components/CreateProjectDialog';
import { CreateTaskDialog } from '@/domains/tasks/components/CreateTaskDialog';
import { TaskSheet } from '@/domains/tasks/components/TaskSheet';
import { Toaster } from '@/ui/overlays/Toaster';
import { useGlobalShortcuts } from '../shortcuts';
import { useUiStore } from '../ui-store';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  useGlobalShortcuts();

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

      {/* Fenêtres globales, ouvrables depuis n'importe quelle page. */}
      <CreateTaskDialog />
      <CreateProjectDialog />
      <CreateClientDialog />
      <TaskSheet />
      <Toaster />
    </div>
  );
}
