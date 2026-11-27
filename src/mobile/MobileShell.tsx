import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  BookOpenCheck,
  CalendarDays,
  FileText,
  FolderClosed,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Settings2,
  Sunrise,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { lazy, Suspense, useEffect, useRef, type TouchEvent } from 'react';
import { APP_MODES, MODE_ICONS, MODE_LABELS, type AppMode } from '@/app/modes';
import { OverlaysBoundary } from '@/app/shell/OverlaysBoundary';
import { useUiStore } from '@/app/ui-store';
import { useModeFollowsPage, useSwitchMode } from '@/app/use-mode';
import { useCompanion } from '@/domains/companion/store';
import { useGoogleAutoSync } from '@/domains/google/hooks';
import { useAutoSync } from '@/domains/sync/hooks';
import { useUpdateNotifier } from '@/domains/update/hooks';
import { transitionFor } from '@/ui/motion/presets';
import { Toaster } from '@/ui/overlays/Toaster';

// Les fenêtres (créer, fiches, focus) : chargées juste après le premier affichage, comme sur le PC.
const MobileOverlays = lazy(() => import('./MobileOverlays').then((module) => ({ default: module.MobileOverlays })));

type Tab = {
  to: '/' | '/tasks' | '/projects' | '/homework' | '/exams' | '/day' | '/calendar';
  label: string;
  icon: LucideIcon;
};

/** Les onglets suivent le mode, comme la barre latérale du PC ; la Journée et l'Agenda sont communs. */
const TABS: Record<AppMode, Tab[]> = {
  work: [
    { to: '/', label: 'Aujourd’hui', icon: LayoutDashboard },
    { to: '/tasks', label: 'Tâches', icon: ListChecks },
    { to: '/projects', label: 'Projets', icon: FolderClosed },
    { to: '/day', label: 'Journée', icon: Sunrise },
    { to: '/calendar', label: 'Agenda', icon: CalendarDays },
  ],
  school: [
    { to: '/', label: 'Aujourd’hui', icon: LayoutDashboard },
    { to: '/homework', label: 'Devoirs', icon: BookOpenCheck },
    { to: '/exams', label: 'Examens', icon: GraduationCap },
    { to: '/day', label: 'Journée', icon: Sunrise },
    { to: '/calendar', label: 'Agenda', icon: CalendarDays },
  ],
};

/** L'onglet d'un écran : lui-même ou un écran qui en dépend (un projet est sous Projets). */
function tabIndex(tabs: Tab[], pathname: string): number {
  return tabs.findIndex(({ to }) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)));
}

/** En haut : Travail ou Cours, puis les pages, le focus et les réglages. Les habitudes restent sur le PC. */
function TopBar() {
  const mode = useUiStore((state) => state.mode);
  const switchMode = useSwitchMode();
  const openFocus = useCompanion((state) => state.setFocusOpen);
  const icon = 'grid size-10 place-items-center rounded-md text-ink-2';
  const active = { className: 'text-ink' };
  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-line/60 bg-canvas px-3 pt-[env(safe-area-inset-top)]">
      <div role="tablist" aria-label="Mode" className="my-2 flex shrink-0 rounded-lg bg-hover p-0.5">
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
              className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-meta whitespace-nowrap ${selected ? 'bg-elevated font-medium text-ink shadow-sm' : 'text-ink-3'}`}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {MODE_LABELS[value]}
            </button>
          );
        })}
      </div>
      <span className="flex-1" />
      <Link to="/pages" aria-label="Pages" className={icon} activeProps={active}>
        <FileText className="size-[21px]" strokeWidth={1.75} />
      </Link>
      <button type="button" onClick={() => openFocus(true)} aria-label="Focus" className={icon}>
        <Timer className="size-[21px]" strokeWidth={1.75} />
      </button>
      <Link to="/settings" aria-label="Réglages" className={icon} activeProps={active}>
        <Settings2 className="size-[21px]" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

/** La barre d'onglets en bas, à portée de pouce. */
function TabBar({ tabs, current }: { tabs: Tab[]; current: number }) {
  return (
    <nav className="grid shrink-0 grid-cols-5 border-t border-line bg-elevated pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ to, label, icon: Icon }, index) => (
        <Link
          key={to}
          to={to}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${index === current ? 'font-medium text-ink' : 'text-ink-3'}`}
        >
          <Icon className="size-[22px]" strokeWidth={index === current ? 2 : 1.75} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Un geste qui part d'un champ, d'un éditeur ou d'une zone qui défile de côté ne change pas d'onglet. */
function swipeAllowedFrom(target: EventTarget | null, stop: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return false;
  for (let el: Element | null = target; el && el !== stop; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return false;
  }
  return true;
}

/** Un glissement franc, surtout horizontal, et assez rapide : pas un défilement qui dévie. */
const SWIPE_MIN_PX = 70;
const SWIPE_MAX_MS = 600;

/** La coquille du téléphone : le mode en haut, l'écran, les onglets. Synchro et Google Agenda tournent ici aussi. */
export function MobileShell() {
  useAutoSync();
  useGoogleAutoSync();
  useModeFollowsPage();
  // Une nouvelle version sur GitHub : « Installer » (l'écran d'Android, à confirmer).
  useUpdateNotifier();
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const mode = useUiStore((state) => state.mode);
  const tabs = TABS[mode];
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = tabIndex(tabs, pathname);
  const main = useRef<HTMLElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; ok: boolean } | null>(null);

  // L'écran qui arrive glisse du côté de son onglet : de la droite s'il est après, de la gauche s'il est avant.
  const previous = useRef(current);
  const direction = current >= 0 && previous.current >= 0 && current !== previous.current ? Math.sign(current - previous.current) : 0;
  useEffect(() => {
    previous.current = current;
    // Un nouvel écran s'ouvre en haut, pas à la hauteur où l'on avait laissé le précédent.
    if (main.current) main.current.scrollTop = 0;
  }, [pathname, current]);

  // Glisser de droite à gauche : l'onglet suivant ; de gauche à droite : le précédent (écrans des onglets seulement).
  const onTouchStart = (event: TouchEvent) => {
    const point = event.touches[0];
    if (!point || event.touches.length > 1 || !main.current) return;
    touch.current = { x: point.clientX, y: point.clientY, t: Date.now(), ok: current >= 0 && tabs[current]?.to === pathname && swipeAllowedFrom(event.target, main.current) };
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const point = event.changedTouches[0];
    if (!start?.ok || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 1.6 * Math.abs(dy) || Date.now() - start.t > SWIPE_MAX_MS) return;
    const next = tabs[current + (dx < 0 ? 1 : -1)];
    if (next) void navigate({ to: next.to });
  };

  return (
    <div className="flex h-dvh flex-col bg-canvas text-[15px] text-ink">
      <TopBar />
      <main
        ref={main}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        // Rien ne dépasse sur les côtés : on ne fait défiler que de haut en bas.
        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <m.div
          key={current >= 0 ? `tab:${current}:${pathname}` : pathname}
          initial={direction === 0 ? false : { x: direction * 56, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={transitionFor('slide', reduced)}
        >
          <Outlet />
        </m.div>
      </main>
      <TabBar tabs={tabs} current={current} />
      <OverlaysBoundary>
        <Suspense fallback={null}>
          <MobileOverlays />
        </Suspense>
      </OverlaysBoundary>
      <Toaster />
    </div>
  );
}
