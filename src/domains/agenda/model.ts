import { addMonths, format, parseISO, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  addDaysISO,
  daysBetween,
  formatLongDate,
  formatMonth,
  isISODate,
  isTime,
  minutesToTime,
  monthOf,
  relativeDateLabel,
  timeToMinutes,
  toISODate,
} from '@/core/dates';
import { formatMoney } from '@/core/money';
import type { PaletteKey } from '@/ui/data/ColorDot';

// ─── Événements saisis ──────────────────────────────────────────────────────

/** Seuls les vrais événements sont saisis (P8) : les autres dates vivent déjà dans leurs tables. */
export type EventKind = 'appointment' | 'meeting' | 'deadline' | 'personal' | 'other';

export const EVENT_KINDS: EventKind[] = ['appointment', 'meeting', 'deadline', 'personal', 'other'];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  appointment: 'Rendez-vous',
  meeting: 'Réunion',
  deadline: 'Échéance',
  personal: 'Perso',
  other: 'Autre',
};

export type AgendaEvent = {
  id: string;
  title: string;
  kind: EventKind;
  allDay: boolean;
  /** 'YYYY-MM-DD' pour une journée entière, sinon 'YYYY-MM-DDTHH:MM' (heure locale). */
  startsAt: string;
  /** Même format. Pour une journée entière : dernier jour inclus (`null` : un seul jour). */
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: PaletteKey | null;
  createdAt: string;
};

export type EventPatch = Partial<{
  title: string;
  kind: EventKind;
  allDay: boolean;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  projectId: string | null;
}>;

// ─── Moment d'un événement ──────────────────────────────────────────────────

/** Durée proposée d'un nouvel événement, et durée affichée d'un événement sans heure de fin. */
export const DEFAULT_DURATION_MIN = 60;

/** Le moment d'un événement tel qu'on le saisit : un jour (ou plusieurs), avec ou sans heures. */
export type EventTiming = {
  /** Premier jour. */
  date: string;
  allDay: boolean;
  /** Journée entière sur plusieurs jours : dernier jour inclus. */
  endDate: string | null;
  /** Heures 'HH:MM', hors journée entière. L'heure de fin est facultative. */
  startTime: string | null;
  endTime: string | null;
};

export function timingOf(event: Pick<AgendaEvent, 'allDay' | 'startsAt' | 'endsAt'>): EventTiming {
  const date = event.startsAt.slice(0, 10);
  if (event.allDay) {
    return { date, allDay: true, endDate: event.endsAt?.slice(0, 10) ?? null, startTime: null, endTime: null };
  }
  return {
    date,
    allDay: false,
    endDate: null,
    startTime: event.startsAt.slice(11, 16) || null,
    endTime: event.endsAt?.slice(11, 16) || null,
  };
}

/** Colonnes enregistrées : `starts_at`, `ends_at` et `all_day`. */
export function timingColumns(timing: EventTiming): Pick<AgendaEvent, 'allDay' | 'startsAt' | 'endsAt'> {
  if (timing.allDay) {
    const endsAt = timing.endDate && timing.endDate > timing.date ? timing.endDate : null;
    return { allDay: true, startsAt: timing.date, endsAt };
  }
  return {
    allDay: false,
    startsAt: `${timing.date}T${timing.startTime}`,
    endsAt: timing.endTime ? `${timing.date}T${timing.endTime}` : null,
  };
}

/** Message d'erreur, ou `null` si le moment est valide. */
export function validateTiming(timing: EventTiming): string | null {
  if (!isISODate(timing.date)) return 'Date invalide.';
  if (timing.allDay) {
    if (timing.endDate && !isISODate(timing.endDate)) return 'Date de fin invalide.';
    if (timing.endDate && timing.endDate < timing.date) return 'La fin est avant le début.';
    return null;
  }
  if (!isTime(timing.startTime)) return 'Heure de début invalide.';
  if (timing.endTime !== null && !isTime(timing.endTime)) return 'Heure de fin invalide.';
  if (timing.endTime !== null && timing.endTime <= timing.startTime) return 'La fin doit être après le début.';
  return null;
}

/** `time` + `minutes`, ou `null` si l'on déborde sur le lendemain. */
function addToTime(time: string, minutes: number): string | null {
  const total = timeToMinutes(time) + minutes;
  return total < 24 * 60 ? minutesToTime(total) : null;
}

/** Changer de jour : un événement sur plusieurs jours garde sa durée. */
export function moveTimingDate(timing: EventTiming, date: string): EventTiming {
  if (timing.allDay && timing.endDate) {
    return { ...timing, date, endDate: addDaysISO(timing.endDate, daysBetween(timing.date, date)) };
  }
  return { ...timing, date };
}

/** Changer l'heure de début : la fin suit pour garder la durée (elle disparaît si elle passait au lendemain). */
export function moveTimingStart(timing: EventTiming, startTime: string): EventTiming {
  if (!timing.startTime || !timing.endTime || !isTime(timing.startTime) || !isTime(timing.endTime) || !isTime(startTime)) {
    return { ...timing, startTime };
  }
  const duration = timeToMinutes(timing.endTime) - timeToMinutes(timing.startTime);
  return { ...timing, startTime, endTime: addToTime(startTime, duration) };
}

/** Passer en journée entière, ou revenir à des horaires (`startTime` proposé, pour la durée par défaut). */
export function setTimingAllDay(timing: EventTiming, allDay: boolean, startTime: string): EventTiming {
  if (allDay) return { date: timing.date, allDay: true, endDate: null, startTime: null, endTime: null };
  return { date: timing.date, allDay: false, endDate: null, startTime, endTime: addToTime(startTime, DEFAULT_DURATION_MIN) };
}

/** Heure proposée : l'heure pleine suivante pour aujourd'hui (entre 8 h et 20 h), 9 h les autres jours. */
export function defaultStartTime(date: string, today: string, now: Date): string {
  if (date !== today) return '09:00';
  const hour = Math.min(Math.max(now.getHours() + 1, 8), 20);
  return minutesToTime(hour * 60);
}

/**
 * Moment d'un nouvel événement, selon l'endroit où l'on a cliqué :
 * un créneau horaire, la ligne « journée » d'un jour, un jour du mois ou le menu « Nouveau ».
 */
export function initialTiming(
  defaults: { eventStart?: string; eventAllDay?: boolean },
  today: string,
  now: Date,
): EventTiming {
  const start = defaults.eventStart ?? today;
  const date = start.slice(0, 10);
  if (defaults.eventAllDay) return { date, allDay: true, endDate: null, startTime: null, endTime: null };
  const startTime = start.slice(11, 16) || defaultStartTime(date, today, now);
  return { date, allDay: false, endDate: null, startTime, endTime: addToTime(startTime, DEFAULT_DURATION_MIN) };
}

// ─── Saisie ─────────────────────────────────────────────────────────────────

export type NewEventInput = {
  title: string;
  kind: EventKind;
  timing: EventTiming;
  location: string | null;
  notes: string | null;
  projectId: string | null;
};

export function validateNewEvent(input: NewEventInput): Partial<Record<'title' | 'timing', string>> {
  const errors: Partial<Record<'title' | 'timing', string>> = {};
  if (input.title.trim() === '') errors.title = 'Donne un titre à l’événement.';
  const timing = validateTiming(input.timing);
  if (timing) errors.timing = timing;
  return errors;
}

// ─── Agenda (P8) ────────────────────────────────────────────────────────────

/** D'où vient une date : elle n'est stockée qu'à cet endroit. */
export type AgendaSource = 'event' | 'project' | 'task' | 'payment';

export const AGENDA_SOURCES: AgendaSource[] = ['event', 'project', 'task', 'payment'];

/** Filtres du calendrier. */
export const AGENDA_SOURCE_LABELS: Record<AgendaSource, string> = {
  event: 'Événements',
  project: 'Projets',
  task: 'Tâches',
  payment: 'Encaissements',
};

export const AGENDA_SOURCE_HINTS: Record<AgendaSource, string> = {
  event: 'rendez-vous, réunions, échéances…',
  project: 'débuts et deadlines',
  task: 'deadlines et tâches prioritaires',
  payment: 'échéances non reçues',
};

/** Option du filtre « Tâches » : les tâches ordinaires, sans deadline ni priorité, à leur début. */
export const PLAIN_TASKS_LABEL = 'Tâches sans deadline';
export const PLAIN_TASKS_HINT = 'à leur date de début';

export type AgendaKind =
  | EventKind
  | 'project_start'
  | 'project_deadline'
  | 'task_due'
  | 'task_scheduled'
  | 'payment_due';

export type AgendaItem = {
  /** `${source}:${id}:${kind}` */
  key: string;
  source: AgendaSource;
  /** Identifiant dans la table d'origine : c'est elle qu'on ouvre au clic. */
  id: string;
  kind: AgendaKind;
  title: string;
  /** Précision : lieu d'un événement, projet d'une tâche, libellé d'un encaissement. */
  detail: string | null;
  /** 'YYYY-MM-DD', ou 'YYYY-MM-DDTHH:MM' pour un événement à heure fixe. */
  start: string;
  end: string | null;
  allDay: boolean;
  projectId: string | null;
  color: PaletteKey | null;
  amountCents: number | null;
};

const KIND_LABELS: Record<Exclude<AgendaKind, EventKind>, string> = {
  project_start: 'Début du projet',
  project_deadline: 'Deadline du projet',
  task_due: 'Deadline de la tâche',
  task_scheduled: 'Début de la tâche',
  payment_due: 'Encaissement attendu',
};

export function agendaKindLabel(kind: AgendaKind): string {
  return kind in EVENT_KIND_LABELS ? EVENT_KIND_LABELS[kind as EventKind] : KIND_LABELS[kind as keyof typeof KIND_LABELS];
}

/** Une date à tenir : deadline de projet ou de tâche, ou événement « Échéance ». */
export function isDeadlineItem(item: Pick<AgendaItem, 'kind'>): boolean {
  return item.kind === 'project_deadline' || item.kind === 'task_due' || item.kind === 'deadline';
}

/** Jour de la deadline : la fin d'une tâche dessinée du début à la deadline, sinon le jour de l'élément. */
export function deadlineDay(item: Pick<AgendaItem, 'kind' | 'start' | 'end'>): string {
  return (item.kind === 'task_due' && item.end ? item.end : item.start).slice(0, 10);
}

/** Premier et dernier jour couverts ('YYYY-MM-DD'). */
export function itemDays(item: Pick<AgendaItem, 'start' | 'end' | 'allDay'>): { first: string; last: string } {
  const first = item.start.slice(0, 10);
  const end = item.allDay && item.end ? item.end.slice(0, 10) : first;
  return { first, last: end > first ? end : first };
}

/**
 * En retard : deadline passée ou encaissement attendu non reçu. Jamais pour un événement ou un début.
 * Une tâche dessinée du début à la deadline est en retard quand sa fin (la deadline) est passée.
 */
export function isAgendaItemLate(item: Pick<AgendaItem, 'kind' | 'start' | 'end'>, today: string): boolean {
  const dated = item.kind === 'project_deadline' || item.kind === 'task_due' || item.kind === 'payment_due';
  const deadline = item.kind === 'task_due' && item.end ? item.end : item.start;
  return dated && deadline.slice(0, 10) < today;
}

/** Heure de début 'HH:MM' d'un événement à heure fixe, sinon `null`. */
export function itemTime(item: Pick<AgendaItem, 'start' | 'allDay'>): string | null {
  return item.allDay ? null : item.start.slice(11, 16) || null;
}

/** « 14:00 – 15:30 », ou « 14:00 » sans heure de fin. */
export function itemTimeRange(item: Pick<AgendaItem, 'start' | 'end' | 'allDay'>): string | null {
  const start = itemTime(item);
  if (!start) return null;
  const end = item.end?.slice(11, 16);
  return end ? `${start} – ${end}` : start;
}

/** « du 25 sept. au 1 oct. » pour un élément sur plusieurs jours, sinon `null`. */
function periodLabel(item: Pick<AgendaItem, 'start' | 'end' | 'allDay'>): string | null {
  const { first, last } = itemDays(item);
  if (last === first) return null;
  const short = (day: string) => format(parseISO(day), 'd MMM', { locale: fr });
  return `du ${short(first)} au ${short(last)}`;
}

/** Texte complet, montré au survol : « Deadline du projet · Site vitrine ». */
export function agendaTooltip(item: AgendaItem, withAmount = true): string {
  const kind = item.kind === 'task_due' && item.end ? 'Tâche, du début à la deadline' : agendaKindLabel(item.kind);
  const parts = [kind, periodLabel(item) ?? itemTimeRange(item), item.title, item.detail];
  if (withAmount && item.amountCents !== null) parts.push(formatMoney(item.amountCents));
  return parts.filter(Boolean).join(' · ');
}

/**
 * Ordre dans une journée : les événements (journée entière, puis par heure), les deadlines
 * de projet, de tâche, les encaissements, les débuts de projet, puis les tâches prioritaires.
 * Quand la place manque (« +N »), c'est la fin de cette liste qui est repliée.
 */
function rank(item: AgendaItem): number {
  switch (item.kind) {
    case 'project_deadline':
      return 2;
    case 'task_due':
      return 3;
    case 'payment_due':
      return 4;
    case 'project_start':
      return 5;
    case 'task_scheduled':
      return 6;
    default:
      return item.allDay ? 0 : 1;
  }
}

export function compareAgendaItems(a: AgendaItem, b: AgendaItem): number {
  return rank(a) - rank(b) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'fr');
}

/** Par jour de début, puis dans l'ordre d'affichage d'une journée. */
export function compareAgendaByDay(a: AgendaItem, b: AgendaItem): number {
  return a.start.slice(0, 10).localeCompare(b.start.slice(0, 10)) || compareAgendaItems(a, b);
}

/** Éléments de chaque jour, triés. Un événement sur plusieurs jours apparaît dans chacun. */
export function groupByDay(items: AgendaItem[], days: string[]): Map<string, AgendaItem[]> {
  const groups = new Map<string, AgendaItem[]>(days.map((day) => [day, []]));
  for (const item of items) {
    const { first, last } = itemDays(item);
    for (const day of days) {
      if (day >= first && day <= last) groups.get(day)!.push(item);
    }
  }
  for (const list of groups.values()) list.sort(compareAgendaItems);
  return groups;
}

// ─── Barres continues (plusieurs jours) ─────────────────────────────────────

/** Dessiné en barre continue : un élément « journée » sur plusieurs jours (événement, tâche du début à la deadline). */
export function isSpanning(item: Pick<AgendaItem, 'start' | 'end' | 'allDay'>): boolean {
  const { first, last } = itemDays(item);
  return item.allDay && last > first;
}

export type SpanSegment = {
  item: AgendaItem;
  /** Colonnes occupées dans la rangée (0 = premier jour affiché), bornes comprises. */
  startCol: number;
  endCol: number;
  /** Couloir : les barres qui se chevauchent sont empilées. */
  lane: number;
  /** La barre commence avant la rangée, ou continue après. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type RowLayout = {
  spans: SpanSegment[];
  /** Nombre de couloirs occupés : la hauteur réservée en haut de chaque case. */
  lanes: number;
  /** Les autres éléments, jour par jour. */
  singles: Map<string, AgendaItem[]>;
};

/**
 * Une rangée de jours consécutifs (une semaine du mois, ou la ligne « journée » d'une semaine) :
 * les éléments sur plusieurs jours deviennent des barres continues, rangées en couloirs (la plus
 * ancienne, puis la plus longue, en haut) ; les autres restent dans leur case.
 */
export function layoutRow(items: AgendaItem[], days: string[]): RowLayout {
  const firstDay = days[0]!;
  const lastDay = days[days.length - 1]!;
  const spans: SpanSegment[] = [];
  for (const item of items) {
    if (!isSpanning(item)) continue;
    const { first, last } = itemDays(item);
    if (last < firstDay || first > lastDay) continue;
    spans.push({
      item,
      startCol: first < firstDay ? 0 : days.indexOf(first),
      endCol: last > lastDay ? days.length - 1 : days.indexOf(last),
      lane: 0,
      continuesBefore: first < firstDay,
      continuesAfter: last > lastDay,
    });
  }
  spans.sort(
    (a, b) =>
      a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol) || compareAgendaItems(a.item, b.item),
  );
  const laneEnds: number[] = [];
  for (const span of spans) {
    const free = laneEnds.findIndex((end) => end < span.startCol);
    span.lane = free === -1 ? laneEnds.length : free;
    laneEnds[span.lane] = span.endCol;
  }
  return {
    spans,
    lanes: laneEnds.length,
    singles: groupByDay(
      items.filter((item) => !isSpanning(item)),
      days,
    ),
  };
}

// ─── Prochains jours (dashboard) ────────────────────────────────────────────

/** Jours couverts par « Prochains jours », aujourd'hui compris. */
export const UPCOMING_AGENDA_DAYS = 7;

export type UpcomingDay = { day: string; items: AgendaItem[] };

/**
 * « Prochains jours » du dashboard : les jours de [today, today + count[ qui ont quelque chose.
 * Les tâches n'y sont pas : celles du jour sont déjà dans « Aujourd'hui », les autres dans la page Tâches.
 * Un élément sur plusieurs jours n'apparaît qu'une fois, à son premier jour visible.
 */
export function upcomingDays(items: AgendaItem[], today: string, count = UPCOMING_AGENDA_DAYS): UpcomingDay[] {
  const days = daysFrom(today, count);
  const groups = new Map<string, AgendaItem[]>(days.map((day) => [day, []]));
  for (const item of items) {
    if (item.source === 'task') continue;
    const { first, last } = itemDays(item);
    if (last < today) continue;
    groups.get(first > today ? first : today)?.push(item);
  }
  return days
    .map((day) => ({ day, items: groups.get(day)!.sort(compareAgendaItems) }))
    .filter((group) => group.items.length > 0);
}

/** Libellé d'un jour de « Prochains jours » : « Aujourd'hui », « Demain », puis « Lundi » et sa date. */
export function upcomingDayLabel(day: string, today: string): { label: string; date: string | null } {
  const diff = daysBetween(today, day);
  const date = format(parseISO(day), 'd MMM', { locale: fr });
  if (diff === 0) return { label: 'Aujourd’hui', date: null };
  if (diff === 1) return { label: 'Demain', date };
  const weekday = format(parseISO(day), 'EEEE', { locale: fr });
  return { label: weekday.charAt(0).toUpperCase() + weekday.slice(1), date };
}

/** « jusqu'à lundi », « jusqu'au 27 oct. » */
function untilLabel(day: string, today: string): string {
  const label = relativeDateLabel(day, today);
  return /^\d/.test(label) ? `jusqu’au ${label}` : `jusqu’à ${label}`;
}

/**
 * Précision discrète après le titre, dans « Prochains jours » : la nature d'une date dérivée,
 * le libellé d'un encaissement, le lieu d'un événement et, s'il dure plusieurs jours, sa fin.
 */
export function upcomingDetail(item: AgendaItem, today: string): string | null {
  switch (item.kind) {
    case 'project_deadline':
      return 'deadline';
    case 'project_start':
      return 'début';
    case 'payment_due':
      return item.detail;
    default: {
      const { first, last } = itemDays(item);
      const until = last > first ? untilLabel(last, today) : null;
      return [item.detail, until].filter(Boolean).join(' · ') || null;
    }
  }
}

// ─── Vues du calendrier ─────────────────────────────────────────────────────

export type CalendarView = 'month' | 'week' | 'day';

export const CALENDAR_VIEWS: CalendarView[] = ['month', 'week', 'day'];

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = { month: 'Mois', week: 'Semaine', day: 'Jour' };

/** Raccourcis des vues (touches seules). */
export const CALENDAR_VIEW_KEYS: Record<CalendarView, string> = { month: 'M', week: 'S', day: 'J' };

/** Les semaines commencent le lundi. */
export function startOfWeekISO(day: string): string {
  return toISODate(startOfWeek(parseISO(day), { weekStartsOn: 1 }));
}

function daysFrom(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDaysISO(first, index));
}

/** Jours affichés : 6 semaines complètes pour un mois, 7 jours pour une semaine, 1 pour un jour. */
export function viewDays(view: CalendarView, anchor: string): string[] {
  if (view === 'day') return [anchor];
  if (view === 'week') return daysFrom(startOfWeekISO(anchor), 7);
  return daysFrom(startOfWeekISO(`${monthOf(anchor)}-01`), 42);
}

/** Plage à charger : du premier jour affiché inclus au lendemain du dernier exclu. */
export function viewRange(days: string[]): { from: string; to: string } {
  return { from: days[0]!, to: addDaysISO(days[days.length - 1]!, 1) };
}

/** Période précédente (−1) ou suivante (+1). */
export function shiftAnchor(view: CalendarView, anchor: string, delta: number): string {
  if (view === 'month') return toISODate(addMonths(parseISO(anchor), delta));
  return addDaysISO(anchor, delta * (view === 'week' ? 7 : 1));
}

/** « Septembre », « 21 – 27 septembre », « 28 sept. – 4 oct. », « Jeudi 24 septembre ». */
export function viewTitle(view: CalendarView, anchor: string, today: string): string {
  const withYear = (day: string) => (day.slice(0, 4) === today.slice(0, 4) ? '' : ` ${day.slice(0, 4)}`);
  if (view === 'month') return formatMonth(monthOf(anchor), today);
  if (view === 'day') return formatLongDate(parseISO(anchor)) + withYear(anchor);

  const days = viewDays('week', anchor);
  const first = parseISO(days[0]!);
  const last = parseISO(days[6]!);
  const end = days[6]!;
  if (monthOf(days[0]!) === monthOf(end)) {
    return `${format(first, 'd')} – ${format(last, 'd MMMM', { locale: fr })}${withYear(end)}`;
  }
  // Une semaine à cheval sur deux années les affiche toutes les deux.
  const start = format(first, days[0]!.slice(0, 4) === end.slice(0, 4) ? 'd MMM' : 'd MMM yyyy', { locale: fr });
  return `${start} – ${format(last, 'd MMM', { locale: fr })}${withYear(end)}`;
}

/** « lun. », « mar. »… */
export function weekdayShort(day: string): string {
  return format(parseISO(day), 'EEE', { locale: fr });
}

// ─── Grille horaire (semaine et jour) ───────────────────────────────────────

/** Un événement trop court reste assez haut pour être lu et cliqué. */
const MIN_BLOCK_MIN = 30;

export type TimedBlock = {
  item: AgendaItem;
  /** Minutes depuis minuit. */
  start: number;
  end: number;
  column: number;
  columns: number;
};

/** Place les événements à heure fixe d'une journée : ceux qui se chevauchent se partagent la largeur. */
export function layoutTimedItems(items: AgendaItem[]): TimedBlock[] {
  const blocks = items
    .filter((item) => !item.allDay && isTime(item.start.slice(11, 16)))
    .map((item) => {
      const start = timeToMinutes(item.start.slice(11, 16));
      const endTime = item.end?.slice(11, 16);
      // Sans fin, durée par défaut ; une fin le lendemain est coupée à minuit.
      let end = start + DEFAULT_DURATION_MIN;
      if (item.end && item.end.slice(0, 10) > item.start.slice(0, 10)) end = 24 * 60;
      else if (endTime && isTime(endTime)) end = timeToMinutes(endTime);
      end = Math.min(Math.max(end, start + MIN_BLOCK_MIN), 24 * 60);
      return { item, start, end, column: 0, columns: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: TimedBlock[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    for (const block of cluster) block.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };

  for (const block of blocks) {
    if (block.start >= clusterEnd) closeCluster();
    const free = columnEnds.findIndex((end) => end <= block.start);
    block.column = free === -1 ? columnEnds.length : free;
    columnEnds[block.column] = block.end;
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  closeCluster();
  return blocks;
}

/** Heures affichées : de 8 h à 20 h, élargies si un événement commence plus tôt ou finit plus tard. */
export function visibleHours(blocks: Pick<TimedBlock, 'start' | 'end'>[]): { first: number; last: number } {
  let first = 8;
  let last = 20;
  for (const block of blocks) {
    first = Math.min(first, Math.floor(block.start / 60));
    last = Math.max(last, Math.ceil(block.end / 60));
  }
  return { first, last };
}

/** Créneau d'une demi-heure qui contient `minutes` : 14 h 47 → '14:30'. */
export function slotStart(minutes: number): string {
  const slot = Math.floor(Math.min(Math.max(minutes, 0), 24 * 60 - 1) / 30) * 30;
  return minutesToTime(slot);
}
