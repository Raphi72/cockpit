import { Link } from '@tanstack/react-router';
import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { PanelLeft } from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { useInboxCount } from '@/domains/inbox';
import { PinnedPagesNav } from '@/domains/pages/components/PinnedPagesNav';
import { ActiveProjectsNav } from '@/domains/projects/components/ActiveProjectsNav';
import { transitionFor } from '@/ui/motion/presets';
import { APP_MODES, MODE_ICONS, MODE_LABELS, MODE_SHORTCUT } from '../modes';
import { NAV, type NavItem } from '../navigation';
import { useUiStore } from '../ui-store';
import { useSwitchMode } from '../use-mode';

const itemClass =
  'flex h-[34px] w-full shrink-0 items-center gap-3 rounded-md px-[9px] whitespace-nowrap text-ink-2 ' +
  'transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink';

/** Captures à trier : un chiffre discret, ou un point sur l'icône quand la barre est réduite. Rien si la boîte est vide. */
function InboxCount({ collapsed }: { collapsed: boolean }) {
  const count = useInboxCount();
  if (count === 0) return null;
  if (collapsed) return <span className="absolute top-1.5 left-[21px] size-1.5 rounded-full bg-accent" aria-label={`${count} à trier`} />;
  return <span className="tnum ml-auto pl-2 text-meta font-normal text-ink-3">{count}</span>;
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  const hint = item.shortcut ? `${item.label} · Ctrl ${item.shortcut}` : item.label;
  return (
    <Link
      to={item.to}
      title={collapsed ? hint : undefined}
      className={`relative ${itemClass}`}
      activeOptions={{ exact: item.to === '/' }}
      activeProps={{ className: 'bg-active !text-ink font-medium' }}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {item.to === '/inbox' && <InboxCount collapsed={collapsed} />}
    </Link>
  );
}

/**
 * Sélecteur de mode (P13) : deux icônes sans texte, l'active posée en relief, comme le sélecteur
 * Chat / Code de Claude Desktop. Côte à côte, ou l'une sous l'autre quand la barre est réduite.
 */
function ModeSwitch({ collapsed }: { collapsed: boolean }) {
  const mode = useUiStore((state) => state.mode);
  const switchMode = useSwitchMode();
  return (
    <div role="radiogroup" aria-label="Mode" className={`flex w-fit gap-0.5 rounded-lg bg-active p-0.5 ${collapsed ? 'flex-col' : ''}`}>
      {APP_MODES.map((option) => {
        const Icon = MODE_ICONS[option];
        const active = option === mode;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={MODE_LABELS[option]}
            title={active ? `Mode ${MODE_LABELS[option]}` : `Passer en mode ${MODE_LABELS[option]} · ${MODE_SHORTCUT}`}
            onClick={() => switchMode(option)}
            className={
              'grid h-7 w-8 place-items-center rounded-md outline-none transition-colors duration-[120ms] ease-soft ' +
              'focus-visible:ring-2 focus-visible:ring-accent-soft ' +
              (active ? 'bg-elevated text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink')
            }
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

/** Les pages du mode : elles apparaissent en fondu quand on change de mode (rien au démarrage). */
function ModeNavLinks({ collapsed }: { collapsed: boolean }) {
  const mode = useUiStore((state) => state.mode);
  const reduced = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return (
    <m.div
      key={mode}
      initial={first.current ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={transitionFor('page', reduced)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <nav className="flex flex-col gap-0.5">
        {NAV[mode].main.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {!collapsed && <PinnedPagesNav />}
      {!collapsed && mode === 'work' && <ActiveProjectsNav />}

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        {NAV[mode].secondary.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>
    </m.div>
  );
}

export const Sidebar = memo(function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <aside className="flex min-h-0 flex-col gap-0.5 overflow-hidden border-r border-line bg-sidebar px-2.5 py-3 select-none">
      <div className="mb-3.5 flex min-h-[34px] shrink-0 items-center">
        <ModeSwitch collapsed={collapsed} />
      </div>

      <ModeNavLinks collapsed={collapsed} />

      <button
        type="button"
        onClick={toggleSidebar}
        title={collapsed ? 'Déplier la barre latérale · Ctrl B' : 'Réduire la barre latérale · Ctrl B'}
        className={`mt-0.5 ${itemClass}`}
      >
        <PanelLeft className="size-4 shrink-0" strokeWidth={1.75} />
        {!collapsed && <span>Réduire</span>}
      </button>
    </aside>
  );
});
