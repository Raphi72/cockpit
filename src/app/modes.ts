import { BriefcaseBusiness, GraduationCap, type LucideIcon } from 'lucide-react';
import type { AppMode } from '@/core/app-mode';

/**
 * Deux modes (P13, V2 étape 2) : Travail (projets, tâches, planning, finances, clients) et Cours
 * (matières, devoirs, emploi du temps, examens, notes). Chaque mode montre les siens ; le calendrier,
 * la boîte de réception et les paramètres sont communs. Le mode est mémorisé (ui-store).
 */
export type { AppMode };

export const APP_MODES: AppMode[] = ['work', 'school'];

export const MODE_LABELS: Record<AppMode, string> = { work: 'Travail', school: 'Cours' };

export const MODE_ICONS: Record<AppMode, LucideIcon> = { work: BriefcaseBusiness, school: GraduationCap };

/** Raccourci qui passe d'un mode à l'autre. */
export const MODE_SHORTCUT = 'Ctrl M';

export function otherMode(mode: AppMode): AppMode {
  return mode === 'work' ? 'school' : 'work';
}

const WORK_PAGES = ['/projects', '/tasks', '/planning', '/finances', '/clients'];
const SCHOOL_PAGES = ['/subjects', '/homework', '/timetable', '/exams', '/grades'];

const startsWithPage = (pathname: string, page: string) => pathname === page || pathname.startsWith(`${page}/`);

/**
 * Mode auquel appartient une page, `null` pour une page commune (Aujourd'hui, boîte de réception,
 * calendrier, paramètres). Ouvrir une page d'un mode (un résultat de recherche, un lien) y fait passer.
 */
export function modeOfPath(pathname: string): AppMode | null {
  if (WORK_PAGES.some((page) => startsWithPage(pathname, page))) return 'work';
  if (SCHOOL_PAGES.some((page) => startsWithPage(pathname, page))) return 'school';
  return null;
}
