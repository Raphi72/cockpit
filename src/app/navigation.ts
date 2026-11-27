import {
  BookOpen,
  Award,
  CalendarDays,
  ChartGantt,
  FileCheck,
  FileText,
  FolderClosed,
  LayoutDashboard,
  NotebookPen,
  Repeat,
  SlidersHorizontal,
  SquareCheck,
  Sunrise,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { AppMode } from './modes';

export type AppPath =
  | '/'
  | '/projects'
  | '/tasks'
  | '/calendar'
  | '/planning'
  | '/finances'
  | '/clients'
  | '/settings'
  | '/subjects'
  | '/homework'
  | '/timetable'
  | '/exams'
  | '/grades'
  | '/day'
  | '/pages'
  | '/habits';

export type NavItem = {
  to: AppPath;
  label: string;
  icon: LucideIcon;
  /** Chiffre du raccourci Ctrl+<n>, propre au mode. */
  shortcut?: string;
};

export type ModeNav = { main: NavItem[]; secondary: NavItem[] };

const today: NavItem = { to: '/', label: "Aujourd'hui", icon: LayoutDashboard, shortcut: '1' };
// Journée (organisateur, étape 3) : commune aux deux modes, sans chiffre.
const dayPage: NavItem = { to: '/day', label: 'Journée', icon: Sunrise };
// Pages (étape 4) : communes aux deux modes ; les favorites sont listées sous la navigation.
const pagesPage: NavItem = { to: '/pages', label: 'Pages', icon: FileText };
// Habitudes (étape 6) : habitudes, objectifs, séances et revue de la semaine, communes aux deux modes.
const habitsPage: NavItem = { to: '/habits', label: 'Habitudes', icon: Repeat };
// Même chiffre dans les deux modes : Ctrl+4 ouvre toujours le calendrier.
const calendar: NavItem = { to: '/calendar', label: 'Calendrier', icon: CalendarDays, shortcut: '4' };
const settings: NavItem = { to: '/settings', label: 'Paramètres', icon: SlidersHorizontal };

/**
 * Les pages communes aux deux modes, en une rangée d'icônes sous Aujourd'hui (le nom au survol) :
 * la barre latérale garde de la place pour les projets en cours et les favoris.
 */
export const NAV_ROW: NavItem[] = [dayPage, pagesPage, habitsPage];

/**
 * La barre latérale de chaque mode. Aujourd'hui, le calendrier et les paramètres sont dans les deux ; le reste n'appartient qu'à un mode (voir modeOfPath).
 */
export const NAV: Record<AppMode, ModeNav> = {
  work: {
    main: [
      today,
      { to: '/projects', label: 'Projets', icon: FolderClosed, shortcut: '2' },
      { to: '/tasks', label: 'Tâches', icon: SquareCheck, shortcut: '3' },
      calendar,
      { to: '/planning', label: 'Planning', icon: ChartGantt, shortcut: '5' },
      { to: '/finances', label: 'Finances', icon: Wallet, shortcut: '6' },
    ],
    secondary: [{ to: '/clients', label: 'Clients', icon: Users }, settings],
  },
  school: {
    main: [
      // Les matières se créent seules depuis les cours de Google ; leur page sert à les gérer (renommer,
      // couleur, supprimer), d'où sa place en fin de liste, sans chiffre.
      today,
      { to: '/homework', label: 'Devoirs', icon: NotebookPen, shortcut: '2' },
      // L'emploi du temps est un mode du calendrier (bouton « Emploi du temps »).
      { ...calendar, shortcut: '3' },
      { to: '/exams', label: 'Examens', icon: FileCheck, shortcut: '4' },
      { to: '/grades', label: 'Notes', icon: Award, shortcut: '5' },
      { to: '/subjects', label: 'Matières', icon: BookOpen },
    ],
    secondary: [settings],
  },
};

/** Toutes les pages des deux modes, une fois chacune (palette Ctrl+K). */
export function allNavItems(): NavItem[] {
  const items = [...NAV.work.main.slice(0, 1), ...NAV_ROW, ...NAV.work.main.slice(1), ...NAV.school.main, ...NAV.work.secondary, ...NAV.school.secondary];
  return items.filter((item, index) => items.findIndex((other) => other.to === item.to) === index);
}

/** Page ouverte par Ctrl+<chiffre> dans ce mode. */
export function shortcutTarget(mode: AppMode, digit: string): NavItem | undefined {
  return NAV[mode].main.find((item) => item.shortcut === digit);
}
