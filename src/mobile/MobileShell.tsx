import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { FileText, LayoutDashboard, Plus, Repeat, Settings2, Sunrise, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useGoogleAutoSync } from '@/domains/google/hooks';
import { useAutoSync } from '@/domains/sync/hooks';
import { Toaster } from '@/ui/overlays/Toaster';
import { CaptureSheet } from './screens/CaptureSheet';

type Tab = { to: '/' | '/day' | '/habits' | '/pages' | '/settings'; label: string; icon: LucideIcon };

const TABS: Tab[] = [
  { to: '/', label: 'Aujourd’hui', icon: LayoutDashboard },
  { to: '/day', label: 'Journée', icon: Sunrise },
  { to: '/habits', label: 'Habitudes', icon: Repeat },
  { to: '/pages', label: 'Pages', icon: FileText },
  { to: '/settings', label: 'Réglages', icon: Settings2 },
];

/** La barre d'onglets en bas, à portée de pouce. */
function TabBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = (to: Tab['to']) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));
  return (
    <nav className="grid shrink-0 grid-cols-5 border-t border-line bg-elevated pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ to, label, icon: Icon }) => (
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

/** La coquille du téléphone : l'écran, le bouton de capture, les onglets. Synchro et Google Agenda tournent ici aussi. */
export function MobileShell() {
  const [capturing, setCapturing] = useState(false);
  useAutoSync();
  useGoogleAutoSync();
  return (
    <div className="flex h-dvh flex-col bg-canvas text-[15px] text-ink">
      <main className="relative min-h-0 flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
        <Outlet />
      </main>
      <button
        type="button"
        onClick={() => setCapturing(true)}
        aria-label="Capturer quelque chose"
        className="fixed right-5 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] z-30 grid size-14 place-items-center rounded-full bg-ink text-canvas shadow-overlay active:scale-95"
      >
        <Plus className="size-6" strokeWidth={2} />
      </button>
      <TabBar />
      <CaptureSheet open={capturing} onClose={() => setCapturing(false)} />
      <Toaster />
    </div>
  );
}
