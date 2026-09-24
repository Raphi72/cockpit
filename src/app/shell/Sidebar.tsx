import { Link } from '@tanstack/react-router';
import { PanelLeft } from 'lucide-react';
import { memo } from 'react';
import { ActiveProjectsNav } from '@/domains/projects/components/ActiveProjectsNav';
import { mainNav, secondaryNav, type NavItem } from '../navigation';
import { useUiStore } from '../ui-store';

const itemClass =
  'flex h-[34px] w-full shrink-0 items-center gap-3 rounded-md px-[9px] whitespace-nowrap text-ink-2 ' +
  'transition-colors duration-[120ms] ease-soft hover:bg-hover hover:text-ink';

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  const hint = item.shortcut ? `${item.label} · Ctrl ${item.shortcut}` : item.label;
  return (
    <Link
      to={item.to}
      title={collapsed ? hint : undefined}
      className={itemClass}
      activeOptions={{ exact: item.to === '/' }}
      activeProps={{ className: 'bg-active !text-ink font-medium' }}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export const Sidebar = memo(function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <aside className="flex min-h-0 flex-col gap-0.5 overflow-hidden border-r border-line bg-sidebar px-2.5 py-3 select-none">
      <div className="mb-3.5 flex h-[34px] shrink-0 items-center gap-2.5 px-2">
        <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-ink">
          <span className="size-[7px] rounded-full border-[1.75px] border-sidebar" />
        </span>
        {!collapsed && <span className="font-semibold tracking-tight">Cockpit</span>}
      </div>

      <nav className="flex flex-col gap-0.5">
        {mainNav.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {!collapsed && <ActiveProjectsNav />}

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        {secondaryNav.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? 'Déplier la barre latérale · Ctrl B' : 'Réduire la barre latérale · Ctrl B'}
          className={itemClass}
        >
          <PanelLeft className="size-4 shrink-0" strokeWidth={1.75} />
          {!collapsed && <span>Réduire</span>}
        </button>
      </div>
    </aside>
  );
});
