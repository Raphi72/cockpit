import {
  BookOpen,
  CalendarDays,
  ChartGantt,
  FolderClosed,
  Inbox,
  LayoutDashboard,
  SlidersHorizontal,
  SquareCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AppMode } from './modes';

export type AppPath =
  | '/'
  | '/inbox'
  | '/projects'
  | '/tasks'
  | '/calendar'
  | '/planning'
  | '/finances'
  | '/clients'
  | '/settings'
  | '/subjects';

export type NavItem = {
  to: AppPath;
  label: string;
  icon: LucideIcon;
  /** Chiffre du raccourci Ctrl+<n>, propre au mode. */
  shortcut?: string;
};

export type ModeNav = { main: NavItem[]; secondary: NavItem[] };

const today: NavItem = { to: '/', label: "Aujourd'hui", icon: LayoutDashboard, shortcut: '1' };
// Sans chiffre : Ctrl+1…6 gardent leurs pages. Son compteur est posé par la barre latérale.
const inbox: NavItem = { to: '/inbox', label: 'Boîte de réception', icon: Inbox };
// Même chiffre dans les deux modes : Ctrl+4 ouvre toujours le calendrier.
const calendar: NavItem = { to: '/calendar', label: 'Calendrier', icon: CalendarDays, shortcut: '4' };
const settings: NavItem = { to: '/settings', label: 'Paramètres', icon: SlidersHorizontal };

/**
 * La barre latérale de chaque mode. Aujourd'hui, la boîte de réception, le calendrier et les paramètres
 * sont dans les deux ; le reste n'appartient qu'à un mode (voir modeOfPath).
 */
export const NAV: Record<AppMode, ModeNav> = {
  work: {
    main: [
      today,
      inbox,
      { to: '/projects', label: 'Projets', icon: FolderClosed, shortcut: '2' },
      { to: '/tasks', label: 'Tâches', icon: SquareCheck, shortcut: '3' },
      calendar,
      { to: '/planning', label: 'Planning', icon: ChartGantt, shortcut: '5' },
      { to: '/finances', label: 'Finances', icon: Wallet, shortcut: '6' },
    ],
    secondary: [{ to: '/clients', label: 'Clients', icon: Users }, settings],
  },
  school: {
    main: [today, inbox, { to: '/subjects', label: 'Matières', icon: BookOpen, shortcut: '2' }, calendar],
    secondary: [settings],
  },
};

/** Toutes les pages des deux modes, une fois chacune (palette Ctrl+K). */
export function allNavItems(): NavItem[] {
  const items = [...NAV.work.main, ...NAV.school.main, ...NAV.work.secondary, ...NAV.school.secondary];
  return items.filter((item, index) => items.findIndex((other) => other.to === item.to) === index);
}

/** Page ouverte par Ctrl+<chiffre> dans ce mode. */
export function shortcutTarget(mode: AppMode, digit: string): NavItem | undefined {
  return NAV[mode].main.find((item) => item.shortcut === digit);
}
