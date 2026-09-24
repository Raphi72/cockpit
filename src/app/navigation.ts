import {
  CalendarDays,
  ChartGantt,
  FolderClosed,
  LayoutDashboard,
  SlidersHorizontal,
  SquareCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type AppPath =
  | '/'
  | '/projects'
  | '/tasks'
  | '/calendar'
  | '/planning'
  | '/finances'
  | '/clients'
  | '/settings';

export type NavItem = {
  to: AppPath;
  label: string;
  icon: LucideIcon;
  /** Chiffre du raccourci Ctrl+<n>. */
  shortcut?: string;
};

export const mainNav: NavItem[] = [
  { to: '/', label: "Aujourd'hui", icon: LayoutDashboard, shortcut: '1' },
  { to: '/projects', label: 'Projets', icon: FolderClosed, shortcut: '2' },
  { to: '/tasks', label: 'Tâches', icon: SquareCheck, shortcut: '3' },
  { to: '/calendar', label: 'Calendrier', icon: CalendarDays, shortcut: '4' },
  { to: '/planning', label: 'Planning', icon: ChartGantt, shortcut: '5' },
  { to: '/finances', label: 'Finances', icon: Wallet, shortcut: '6' },
];

export const secondaryNav: NavItem[] = [
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/settings', label: 'Paramètres', icon: SlidersHorizontal },
];
