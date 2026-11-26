import { addDaysISO, isISODate } from '@/core/dates';
import type { AppMode } from '@/core/app-mode';
import type { AppColor } from '@/ui/data/ColorDot';

/**
 * Organisateur de journée (V2, étape 3). Un module est un modèle réutilisable (P16) ; un bloc est un
 * module posé sur un jour à une heure : c'est lui qui porte sa date. Une tâche placée dans un bloc
 * prend la date du bloc (P17). Une semaine type s'applique en créant des blocs ordinaires (P18).
 * Les heures sont des minutes depuis minuit dans les calculs, 'HH:MM' en base ('24:00' = minuit).
 */

export type BlockMode = AppMode | 'both';
export type BlockStatus = 'planned' | 'done' | 'missed';

export const BLOCK_MODE_LABELS: Record<BlockMode, string> = { work: 'Travail', school: 'Cours', both: 'Les deux' };
export const BLOCK_STATUS_LABELS: Record<BlockStatus, string> = { planned: 'Prévu', done: 'Fait', missed: 'Raté' };

/** Icônes possibles d'un module (liste fermée : `day/icons.ts` les dessine). */
export const ICON_KEYS = [
  'dumbbell',
  'notebook',
  'brain',
  'book',
  'briefcase',
  'code',
  'mail',
  'users',
  'coffee',
  'utensils',
  'music',
  'palette',
  'footprints',
  'heart',
  'moon',
  'car',
  'gamepad',
  'sparkles',
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export function isIconKey(value: string): value is IconKey {
  return (ICON_KEYS as readonly string[]).includes(value);
}

export type Module = {
  id: string;
  name: string;
  icon: IconKey;
  color: AppColor;
  durationMin: number;
  mode: BlockMode;
  sortOrder: number;
  /**
   * Un module « pour une fois » (« Courses · 1 h ») : il attend dans « À caser », les jours suivants
   * aussi, jusqu'à être posé (il devient un bloc et disparaît) ou jeté. Absent : un module de la bibliothèque.
   */
  oneOff?: boolean;
};

export type ModuleInput = Pick<Module, 'name' | 'icon' | 'color' | 'durationMin' | 'mode' | 'oneOff'>;

export function validateModule(input: ModuleInput): Partial<Record<'name' | 'durationMin', string>> {
  const errors: Partial<Record<'name' | 'durationMin', string>> = {};
  if (input.name.trim() === '') errors.name = 'Donne un nom au module (« Sport », « Lecture »…).';
  if (!Number.isInteger(input.durationMin) || input.durationMin < 15 || input.durationMin > 24 * 60) {
    errors.durationMin = 'Entre 15 minutes et 24 heures.';
  }
  return errors;
}

/** Modules d'un mode : ceux du mode, et ceux des deux. */
export function modulesOfMode(modules: Module[], mode: AppMode): Module[] {
  return modules.filter((m) => m.mode === mode || m.mode === 'both');
}

export type DayBlock = {
  id: string;
  templateId: string | null;
  date: string;
  /** 'HH:MM' */
  startsAt: string;
  /** 'HH:MM', jusqu'à '24:00' */
  endsAt: string;
  title: string;
  icon: IconKey;
  color: AppColor;
  mode: BlockMode;
  status: BlockStatus;
};

export type BlockInput = Omit<DayBlock, 'id' | 'status'> & { status?: BlockStatus };

// ─── Heures ─────────────────────────────────────────────────────────────────

export const DAY_MINUTES = 24 * 60;

/** Pas du glisser-déposer et des étirements. */
export const SNAP_MIN = 15;

/** Plus court bloc possible. */
export const MIN_BLOCK_MIN = 15;

/** '14:30' → 870 ; '24:00' → 1440. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** 870 → '14:30' ; 1440 → '24:00'. */
export function fromMinutes(minutes: number): string {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), DAY_MINUTES);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Au quart d'heure le plus proche. */
export function snap(minutes: number, step = SNAP_MIN): number {
  return Math.round(minutes / step) * step;
}

export function isBlockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) || value === '24:00';
}

export function blockDuration(block: Pick<DayBlock, 'startsAt' | 'endsAt'>): number {
  return toMinutes(block.endsAt) - toMinutes(block.startsAt);
}

export function validateBlock(input: Pick<BlockInput, 'title' | 'date' | 'startsAt' | 'endsAt'>): string | null {
  if (input.title.trim() === '') return 'Donne un titre au bloc.';
  if (!isISODate(input.date)) return 'Date invalide.';
  if (!isBlockTime(input.startsAt) || !isBlockTime(input.endsAt)) return 'Heures invalides.';
  if (toMinutes(input.endsAt) - toMinutes(input.startsAt) < MIN_BLOCK_MIN) return 'Un bloc dure au moins 15 minutes.';
  return null;
}

/** Un module posé un jour à une heure : il garde sa durée, sans dépasser minuit. */
export function blockFromModule(module: Module, date: string, startMin: number): BlockInput {
  const start = Math.min(Math.max(snap(startMin), 0), DAY_MINUTES - MIN_BLOCK_MIN);
  return {
    // Un module « pour une fois » disparaît une fois posé : le bloc ne garde pas de lien vers lui.
    templateId: module.oneOff ? null : module.id,
    date,
    startsAt: fromMinutes(start),
    endsAt: fromMinutes(Math.min(start + module.durationMin, DAY_MINUTES)),
    title: module.name,
    icon: module.icon,
    color: module.color,
    mode: module.mode,
  };
}

/**
 * Un bloc remis dans « À caser » : il redevient un module « pour une fois », avec son nom, son aspect et
 * sa durée, qu'on reposera plus tard.
 */
export function moduleFromBlock(block: Pick<DayBlock, 'title' | 'icon' | 'color' | 'mode' | 'startsAt' | 'endsAt'>): ModuleInput {
  return { name: block.title, icon: block.icon, color: block.color, durationMin: blockDuration(block), mode: block.mode, oneOff: true };
}

/** Un bloc déplacé : même durée, nouveau jour et nouvelle heure (au quart d'heure, dans la journée). */
export function movedBlock(block: Pick<DayBlock, 'startsAt' | 'endsAt'>, date: string, startMin: number): Pick<DayBlock, 'date' | 'startsAt' | 'endsAt'> {
  const duration = blockDuration(block);
  const start = Math.min(Math.max(snap(startMin), 0), DAY_MINUTES - duration);
  return { date, startsAt: fromMinutes(start), endsAt: fromMinutes(start + duration) };
}

/** Un bloc étiré : nouvelle fin au quart d'heure, 15 minutes au moins, jamais après minuit. */
export function resizedEnd(block: Pick<DayBlock, 'startsAt'>, endMin: number): string {
  const start = toMinutes(block.startsAt);
  return fromMinutes(Math.min(Math.max(snap(endMin), start + MIN_BLOCK_MIN), DAY_MINUTES));
}

/** « 1 h 30 », « 45 min » */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

// ─── Disposition et chevauchements ──────────────────────────────────────────

export type Interval = { start: number; end: number };

export type Placed<T> = { item: T; lane: number; lanes: number };

/** Côte à côte quand ils se chevauchent : un couloir par élément, le moins de couloirs possible. */
export function layoutIntervals<T>(items: T[], interval: (item: T) => Interval): Placed<T>[] {
  const sorted = [...items].sort((a, b) => interval(a).start - interval(b).start || interval(a).end - interval(b).end);
  const placed: Placed<T>[] = [];
  let cluster: { item: T; lane: number; end: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) placed.push({ item: c.item, lane: c.lane, lanes });
    cluster = [];
  };
  for (const item of sorted) {
    const { start, end } = interval(item);
    if (cluster.length > 0 && start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.end > start).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    cluster.push({ item, lane, end });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return placed;
}

export const blockInterval = (block: Pick<DayBlock, 'startsAt' | 'endsAt'>): Interval => ({
  start: toMinutes(block.startsAt),
  end: toMinutes(block.endsAt),
});

/**
 * Un moment déjà pris dans la journée : cours, rendez-vous, examen (affichés à côté des blocs), à la
 * couleur de sa matière ou de son agenda. Un événement Google (un cours) s'ouvre au clic (`googleId`),
 * et un cours montre les devoirs à rendre pour lui.
 */
export type BusyItem = Interval & { key: string; title: string; color?: AppColor | null; googleId?: string | null; homework?: string[] };

/** Ce que le bloc chevauche (signalé, jamais interdit). */
export function overlapsOf(block: Pick<DayBlock, 'startsAt' | 'endsAt'>, busy: BusyItem[]): BusyItem[] {
  const { start, end } = blockInterval(block);
  return busy.filter((item) => item.start < end && item.end > start);
}

// ─── Tâches dans un bloc (P17) ──────────────────────────────────────────────

/** Une tâche sans estimation compte pour 30 minutes dans un bloc. */
export const DEFAULT_TASK_MIN = 30;

export function taskMinutes(task: { estimateMin: number | null }): number {
  return task.estimateMin ?? DEFAULT_TASK_MIN;
}

/** Temps pris par les tâches du bloc et temps qui reste (négatif : le bloc déborde). */
export function blockLoad(block: Pick<DayBlock, 'startsAt' | 'endsAt'>, tasks: { estimateMin: number | null }[]): { used: number; free: number } {
  const used = tasks.reduce((sum, task) => sum + taskMinutes(task), 0);
  return { used, free: blockDuration(block) - used };
}

// ─── Bloc en cours ──────────────────────────────────────────────────────────

/** Le bloc en cours à `now` (minutes), avec le temps qui reste ; le premier qui a commencé s'il y en a deux. */
export function currentBlock(blocks: DayBlock[], now: number): { block: DayBlock; remaining: number } | null {
  const running = blocks
    .filter((b) => toMinutes(b.startsAt) <= now && now < toMinutes(b.endsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const block = running[0];
  return block ? { block, remaining: toMinutes(block.endsAt) - now } : null;
}

/** Le prochain bloc de la journée, pas encore commencé. */
export function nextBlock(blocks: DayBlock[], now: number): DayBlock | null {
  return [...blocks].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).find((b) => toMinutes(b.startsAt) > now) ?? null;
}

// ─── Bilan du soir ──────────────────────────────────────────────────────────

/** Le bilan est proposé à partir de 20 h, ou plus tôt si tous les blocs du jour sont finis. */
export const REVIEW_FROM_MIN = 20 * 60;

/** Blocs du jour terminés et pas encore marqués (fait, raté ou décalé). */
export function blocksToReview(blocks: DayBlock[], now: number): DayBlock[] {
  return blocks
    .filter((b) => b.status === 'planned' && toMinutes(b.endsAt) <= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function isReviewTime(blocks: DayBlock[], now: number): boolean {
  if (blocksToReview(blocks, now).length === 0) return false;
  return now >= REVIEW_FROM_MIN || blocks.every((b) => toMinutes(b.endsAt) <= now);
}

// ─── Remplir les trous ──────────────────────────────────────────────────────

/** Créneaux libres de [from, to[ d'au moins `min` minutes, hors de ce qui est déjà pris. */
export function freeSlots(busy: Interval[], from: number, to: number, min = 30): Interval[] {
  const sorted = [...busy].filter((b) => b.end > from && b.start < to).sort((a, b) => a.start - b.start);
  const slots: Interval[] = [];
  let cursor = from;
  for (const item of sorted) {
    if (item.start - cursor >= min) slots.push({ start: cursor, end: item.start });
    cursor = Math.max(cursor, item.end);
  }
  if (to - cursor >= min) slots.push({ start: cursor, end: to });
  return slots;
}

/** Plus long bloc proposé : au-delà, mieux vaut une pause. */
export const FILL_MAX_BLOCK_MIN = 120;

/** Heures où l'on propose de travailler : de 8 h à 21 h (et pas avant l'heure qu'il est). */
export const FILL_WINDOW = { start: 8 * 60, end: 21 * 60 };

export type FillTask = { id: string; homework: boolean; estimateMin: number | null };

export type ProposedBlock = { start: number; end: number; homework: boolean; taskIds: string[] };

/**
 * Propose des blocs dans les créneaux libres pour les tâches données (déjà dans l'ordre de préférence,
 * voir rankForPlan) : un bloc ne mélange pas devoirs et travail, ne dépasse ni le créneau ni 2 h, et
 * commence au quart d'heure. Une tâche qui ne tient nulle part est laissée. Rien n'est posé ici.
 */
export function proposeFill(slots: Interval[], tasks: FillTask[]): ProposedBlock[] {
  const left = [...tasks];
  const blocks: ProposedBlock[] = [];
  for (const slot of slots) {
    let cursor = Math.ceil(slot.start / SNAP_MIN) * SNAP_MIN;
    while (left.length > 0 && slot.end - cursor >= DEFAULT_TASK_MIN) {
      const limit = Math.min(slot.end, cursor + FILL_MAX_BLOCK_MIN);
      const first = left.findIndex((t) => taskMinutes(t) <= limit - cursor);
      if (first === -1) break;
      const homework = left[first]!.homework;
      const taskIds: string[] = [];
      let end = cursor;
      for (let i = 0; i < left.length; ) {
        const task = left[i]!;
        if (task.homework === homework && end + taskMinutes(task) <= limit) {
          taskIds.push(task.id);
          end += taskMinutes(task);
          left.splice(i, 1);
        } else i += 1;
      }
      blocks.push({ start: cursor, end, homework, taskIds });
      cursor = Math.ceil(end / SNAP_MIN) * SNAP_MIN;
    }
  }
  return blocks;
}

// ─── Semaines types (P18) ───────────────────────────────────────────────────

export type WeekTemplate = { id: string; name: string; sortOrder: number; blockCount: number };

export type WeekTemplateBlock = {
  id: string;
  weekTemplateId: string;
  templateId: string | null;
  /** 1 = lundi … 7 = dimanche */
  weekday: number;
  startsAt: string;
  endsAt: string;
  title: string;
  icon: IconKey;
  color: AppColor;
  mode: BlockMode;
};

/** Jour de la semaine ISO d'une date (1 = lundi … 7 = dimanche). */
export function isoWeekdayOf(day: string): number {
  const js = new Date(`${day}T12:00:00`).getDay();
  return js === 0 ? 7 : js;
}

/** Les blocs que crée une semaine type appliquée aux jours donnés (une semaine affichée). */
export function blocksFromWeekTemplate(templateBlocks: WeekTemplateBlock[], days: string[]): BlockInput[] {
  return days.flatMap((day) =>
    templateBlocks
      .filter((b) => b.weekday === isoWeekdayOf(day))
      .map((b) => ({
        templateId: b.templateId,
        date: day,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        title: b.title,
        icon: b.icon,
        color: b.color,
        mode: b.mode,
      })),
  );
}

/** Une semaine de blocs devient une semaine type : chaque bloc garde son jour de la semaine et ses heures. */
export function weekTemplateFromBlocks(blocks: DayBlock[]): Omit<WeekTemplateBlock, 'id' | 'weekTemplateId'>[] {
  return blocks.map((b) => ({
    templateId: b.templateId,
    weekday: isoWeekdayOf(b.date),
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    title: b.title,
    icon: b.icon,
    color: b.color,
    mode: b.mode,
  }));
}

/** Les 7 jours de la semaine qui contient `day`, à partir de son premier jour (réglage). */
export function weekDays(day: string, weekStartsOn: 0 | 1): string[] {
  const offset = (new Date(`${day}T12:00:00`).getDay() - weekStartsOn + 7) % 7;
  const first = addDaysISO(day, -offset);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(first, i));
}
