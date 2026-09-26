import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { addDaysISO, daysBetween, toISODate } from '@/core/dates';
import type { WeekStart } from '@/core/week-start';
import type { PaymentListItem } from '@/domains/finance/payments/model';
import type { ProjectListItem } from '@/domains/projects/model';

// ─── Période affichée ───────────────────────────────────────────────────────

export type PlanningZoom = 'month' | 'quarter';

export const PLANNING_ZOOMS: PlanningZoom[] = ['month', 'quarter'];

export const PLANNING_ZOOM_LABELS: Record<PlanningZoom, string> = { month: 'Mois', quarter: 'Trimestre' };

/** Semaines affichées, et de combien de semaines on avance avec les flèches (on garde un peu de contexte). */
const ZOOM_WEEKS: Record<PlanningZoom, { weeks: number; step: number }> = {
  month: { weeks: 6, step: 4 },
  quarter: { weeks: 13, step: 12 },
};

export type PlanningPeriod = {
  /** Premier jour affiché (un lundi, ou un dimanche selon Paramètres). */
  start: string;
  /** Nombre de jours affichés. */
  days: number;
  /** Le premier jour de chaque semaine affichée. */
  weeks: string[];
};

/** Premier jour de la semaine de `day`. */
function weekStartOf(day: string, weekStartsOn: WeekStart): string {
  return toISODate(startOfWeek(parseISO(day), { weekStartsOn }));
}

/**
 * Période affichée autour de `anchor` (aujourd'hui par défaut) : elle commence au début de la semaine
 * précédente, pour garder un peu de passé en vue. 6 semaines en zoom mois, 13 en zoom trimestre.
 */
export function planningPeriod(zoom: PlanningZoom, anchor: string, weekStartsOn: WeekStart = 1): PlanningPeriod {
  const start = addDaysISO(weekStartOf(anchor, weekStartsOn), -7);
  const { weeks } = ZOOM_WEEKS[zoom];
  return { start, days: weeks * 7, weeks: Array.from({ length: weeks }, (_, i) => addDaysISO(start, i * 7)) };
}

/** Période précédente (−1) ou suivante (+1) : 4 semaines en zoom mois, 12 en zoom trimestre. */
export function shiftPlanningAnchor(zoom: PlanningZoom, anchor: string, delta: number): string {
  return toISODate(addWeeks(parseISO(anchor), delta * ZOOM_WEEKS[zoom].step));
}

/** Dernier jour affiché (inclus). */
export function periodEnd(period: PlanningPeriod): string {
  return addDaysISO(period.start, period.days - 1);
}

/** « 21 sept. – 1 nov. », avec l'année quand elle diffère de celle d'aujourd'hui. */
export function planningTitle(period: PlanningPeriod, today: string): string {
  const end = periodEnd(period);
  const short = (day: string) =>
    format(parseISO(day), day.slice(0, 4) === today.slice(0, 4) ? 'd MMM' : 'd MMM yyyy', { locale: fr });
  return `${short(period.start)} – ${short(end)}`;
}

/** Position du début d'un jour dans la période : 0 au premier jour, 1 après le dernier. */
export function dayOffset(period: PlanningPeriod, day: string): number {
  return daysBetween(period.start, day) / period.days;
}

/** Les mois qui commencent dans la période (et le premier, même entamé) : leur nom et leur position. */
export function monthMarks(period: PlanningPeriod): { day: string; label: string; offset: number }[] {
  const marks: { day: string; label: string; offset: number }[] = [];
  for (let i = 0; i < period.days; i++) {
    const day = addDaysISO(period.start, i);
    if (i === 0 || day.endsWith('-01')) {
      const label = format(parseISO(day), 'MMMM', { locale: fr });
      marks.push({ day, label: label.charAt(0).toUpperCase() + label.slice(1), offset: i / period.days });
    }
  }
  // Le mois entamé au début n'a pas de nom si le suivant commence juste après : on évite le chevauchement.
  return marks.filter((mark, i) => i !== 0 || (marks[1]?.offset ?? 1) - mark.offset > 0.08);
}

// ─── Lignes de projets ──────────────────────────────────────────────────────

export type PlanningPayment = {
  id: string;
  /** Date prévue, ou date de réception pour un encaissement reçu. */
  day: string;
  label: string;
  amountCents: number;
  received: boolean;
  /** Attendu et date prévue passée. */
  late: boolean;
};

export type PlanningRow = {
  project: ProjectListItem;
  /**
   * Barre du début à la deadline (jours inclus). `from` absent : le projet est en cours sans date de
   * début (la barre part du bord gauche, estompée). `to` absent : pas de deadline (elle file jusqu'au
   * bord droit). Un projet à venir sans début n'a pas de barre, seulement sa deadline.
   */
  from: string | null;
  to: string | null;
  bar: boolean;
  /** Deadline dépassée : une queue rouge de la deadline jusqu'à aujourd'hui. */
  lateUntil: string | null;
  payments: PlanningPayment[];
};

/** Premier et dernier jour qu'occupe la ligne (barre, retard, encaissements compris) ; `null` : sans limite. */
function extent(row: PlanningRow): { first: string | null; last: string | null } {
  const days = row.payments.map((p) => p.day);
  if (!row.bar) {
    const all = [row.to!, ...days].sort();
    return { first: all[0]!, last: all[all.length - 1]! };
  }
  const last = row.to === null ? null : [row.to, row.lateUntil ?? row.to, ...days].sort().pop()!;
  const first = row.from === null ? null : [row.from, ...days].sort()[0]!;
  return { first, last };
}

/**
 * Lignes du planning : une par projet en cours ou à venir qui a au moins une date (les autres sont
 * listés à part, « sans dates »). Rangées par début (ceux qui ont commencé sans date d'abord), puis
 * par deadline. Encaissements du projet : attendus à leur date prévue, reçus à leur date de réception.
 */
export function planningRows(
  projects: ProjectListItem[],
  payments: PaymentListItem[],
  today: string,
): { rows: PlanningRow[]; undated: ProjectListItem[] } {
  const rows: PlanningRow[] = [];
  const undated: ProjectListItem[] = [];
  for (const project of projects) {
    if (!project.startDate && !project.deadline) {
      undated.push(project);
      continue;
    }
    const bar = project.startDate !== null || project.status === 'active';
    rows.push({
      project,
      from: project.startDate,
      to: project.deadline,
      bar,
      lateUntil: project.deadline && project.deadline < today ? today : null,
      payments: payments
        .filter((p) => p.projectId === project.id)
        .map((p): PlanningPayment | null => {
          const received = p.status === 'received';
          const day = received ? p.receivedDate : p.dueDate;
          if (!day) return null;
          return { id: p.id, day, label: p.label, amountCents: p.amountCents, received, late: !received && day < today };
        })
        .filter((p): p is PlanningPayment => p !== null)
        .sort((a, b) => a.day.localeCompare(b.day)),
    });
  }
  const key = (row: PlanningRow) => `${row.bar ? (row.from ?? '0000') : row.to}|${row.to ?? '9999'}`;
  rows.sort((a, b) => key(a).localeCompare(key(b)) || a.project.name.localeCompare(b.project.name, 'fr'));
  return { rows, undated };
}

/** La ligne a quelque chose dans la période (barre, retard, deadline ou encaissement). */
export function isInPeriod(row: PlanningRow, period: PlanningPeriod): boolean {
  const { first, last } = extent(row);
  return (first === null || first <= periodEnd(period)) && (last === null || last >= period.start);
}

// ─── Bande de densité ───────────────────────────────────────────────────────

export type WeekLoad = { week: string; projects: ProjectListItem[] };

/**
 * Projets menés en même temps, semaine par semaine : ceux dont la barre (retard compris) touche la
 * semaine. Un projet sans deadline compte à partir de son début ; un projet en cours sans date de
 * début compte jusqu'à sa deadline. Un projet à venir qui n'a qu'une deadline ne compte pas : on ne
 * sait pas quand il commence.
 */
export function weeklyLoad(rows: PlanningRow[], period: PlanningPeriod): WeekLoad[] {
  return period.weeks.map((week) => {
    const sunday = addDaysISO(week, 6);
    const projects = rows
      .filter((row) => {
        if (!row.bar) return false;
        const end = row.to === null ? null : (row.lateUntil ?? row.to);
        return (row.from === null || row.from <= sunday) && (end === null || end >= week);
      })
      .map((row) => row.project);
    return { week, projects };
  });
}
