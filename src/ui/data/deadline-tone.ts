import type { DeadlineTone } from '@/core/deadline';

/** Couleur du texte d'une deadline (voir core/deadline.ts). */
export const DEADLINE_TONE_CLASS: Record<DeadlineTone, string> = {
  late: 'text-danger',
  today: 'text-danger',
  soon: 'text-warning',
  week: 'text-accent',
  later: 'text-ink-3',
  done: 'text-success',
};
