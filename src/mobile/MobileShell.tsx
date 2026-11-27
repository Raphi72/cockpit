import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  BookOpenCheck,
  CalendarDays,
  FileText,
  FolderClosed,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Repeat,
  Settings2,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { APP_MODES, MODE_ICONS, MODE_LABELS, type AppMode } from '@/app/modes';
import { OverlaysBoundary } from '@/app/shell/OverlaysBoundary';
import { useUiStore } from '@/app/ui-store';
import { useModeFollowsPage, useSwitchMode } from '@/app/use-mode';
import { useCompanion } from '@/domains/companion/store';
import { useGoogleAutoSync } from '@/domains/google/hooks';
import { useAutoSync } from '@/domains/sync/hooks';
import { Toaster } from '@/ui/overlays/Toaster';

// Les fenêtres (créer, fiches, focus) : chargées juste après le premier affichage, comme sur le PC.
const MobileOverlays = lazy(() => import('./MobileOverlays').then((module) => ({ default: module.MobileOverlays })));

type Tab = { to: '/' | '/tasks' | '/projects' | '/homework' | '/exams' | '/calendar' | '/pages'; label: string; icon: LucideIcon };

/** Les onglets suivent le mode, comme la barre latérale du PC ; l'agenda et les pages sont communs. */
const TABS: Record<AppMode, Tab[]> = {
  work: [
    { to: '/', label: 'Aujourd’hui', icon: LayoutDashboard },
    { to: '/tasks', label: 'Tâches', icon: ListChecks },
    { to: '/projects', label: 'Projets', icon: FolderClosed },
    { to: '/calendar', label: 'Agenda', icon: CalendarDays },
    { to: '/pages', label: 'Pages', icon: FileText },
  ],
  school: [
    { to: '/', label: 'Aujourd’hui', icon: LayoutDashboard },
    { to: '/homework', label: 'Devoirs', icon: BookOpenCheck },
    { to: '/exams', label: 'Examens', icon: GraduationCap },
    { to: '/calendar', label: 'Agenda', icon: CalendarDays },
    { to: '/pages', label: 'Pages', icon: FileText },
  ],
};

/** En haut : Travail ou Cours, puis le focus, les habitudes et les réglages. */
function TopBar() {
  const mode = useUiStore((state) => state.mode);
  const switchMode = useSwitchMode();
  const openFocus = useCompanion((state) => state.setFocusOpen);
  const icon = 'grid size-10 place-items-center rounded-md text-ink-2';
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-line/60 bg-canvas px-3 pt-[env(safe-area-inset-top)]">
      <div role="tablist" aria-label="Mode" className="my-2 flex rounded-lg bg-hover p-0.5">
        {APP_MODES.map((value) => {
          const Icon = MODE_ICONS[value];
          const selected = value === mode;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => switchMode(value)}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-meta ${selected ? 'bg-elevated font-medium text-ink shadow-sm' : 'text-ink-3'}`}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {MODE_LABELS[value]}
            </button>
          );
        })}
      </div>
      <span className="flex-1" />
      <button type="button" onClick={() => openFocus(true)} aria-label="Focus" className={icon}>
        <Timer className="size-[21px]" strokeWidth={1.75} />
      </button>
      <Link to="/habits" aria-label="Habitudes" className={icon} activeProps={{ className: 'text-ink' }}>
        <Repeat className="size-[21px]" strokeWidth={1.75} />
      </Link>
      <Link to="/settings" aria-label="Réglages" className={icon} activeProps={{ className: 'text-ink' }}>
        <Settings2 className="size-[21px]" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

/** La barre d'onglets en bas, à portée de pouce. */
function TabBar() {
  const mode = useUiStore((state) => state.mode);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = (to: Tab['to']) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));
  return (
    <nav className="grid shrink-0 grid-cols-5 border-t border-line bg-elevated pb-[env(safe-area-inset-bottom)]">
      {TABS[mode].map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${active(to) ? 'font-medium text-ink' : 'text-ink-3'}`}
        >
          <Icon className="size-[22px]" strokeWidth={active(to) ? 2 : 1.75} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** La coquille du téléphone : le mode en haut, l'écran, les onglets. Synchro et Google Agenda tournent ici aussi. */
export function MobileShell() {
  useAutoSync();
  useGoogleAutoSync();
  useModeFollowsPage();
  // Un nouvel écran s'ouvre en haut, pas à la hauteur où l'on avait laissé le précédent.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [pathname]);
  return (
    <div className="flex h-dvh flex-col bg-canvas text-[15px] text-ink">
      <TopBar />
      <main ref={main} className="relative min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <TabBar />
      <OverlaysBoundary>
        <Suspense fallback={null}>
          <MobileOverlays />
        </Suspense>
      </OverlaysBoundary>
      <Toaster />
    </div>
  );
}
