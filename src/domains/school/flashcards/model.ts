import { addDaysISO } from '@/core/dates';
import type { PaletteKey } from '@/ui/data/ColorDot';

/**
 * Flashcards et répétition espacée (V2, étape 5). Seules les révisions sont stockées ; l'état d'une
 * carte (intervalle, facilité, prochaine échéance) est recalculé en les rejouant dans l'ordre. La
 * notation suit Anki : 1 à revoir, 2 difficile, 3 bien, 4 facile.
 */

export type Rating = 1 | 2 | 3 | 4;

export const RATINGS: { rating: Rating; label: string; key: string }[] = [
  { rating: 1, label: 'À revoir', key: '1' },
  { rating: 2, label: 'Difficile', key: '2' },
  { rating: 3, label: 'Bien', key: '3' },
  { rating: 4, label: 'Facile', key: '4' },
];

export type Review = { reviewedOn: string; rating: Rating };

export type Flashcard = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectColor: PaletteKey;
  pageId: string | null;
  front: string;
  back: string;
  createdAt: string;
  /** Ses révisions, de la plus ancienne à la plus récente. */
  reviews: Review[];
};

export type CardState = {
  /** Révisions réussies d'affilée (une carte « à revoir » repart de zéro). */
  reps: number;
  /** Jours avant la prochaine révision. */
  interval: number;
  /** Facilité : plus elle est haute, plus l'intervalle grandit vite (2,5 au départ, 1,3 au moins). */
  ease: number;
  /** Prochaine révision ('YYYY-MM-DD'), `null` pour une carte jamais revue. */
  due: string | null;
  lapses: number;
};

export const NEW_CARD: CardState = { reps: 0, interval: 0, ease: 2.5, due: null, lapses: 0 };

/** Nouvelles cartes proposées par jour, au plus. */
export const NEW_PER_DAY = 20;

/** L'état après une révision (SM-2 simplifié, à la manière d'Anki). */
export function applyReview(state: CardState, review: Review): CardState {
  let { reps, interval, ease, lapses } = state;
  switch (review.rating) {
    case 1:
      reps = 0;
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
      lapses += 1;
      break;
    case 2:
      interval = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
      reps += 1;
      break;
    case 3:
      interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
      reps += 1;
      break;
    case 4:
      interval = reps === 0 ? 3 : reps === 1 ? 6 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
      ease += 0.15;
      reps += 1;
      break;
  }
  return { reps, interval, ease: Math.round(ease * 100) / 100, due: addDaysISO(review.reviewedOn, interval), lapses };
}

/** L'état d'une carte, ses révisions rejouées dans l'ordre. */
export function cardState(reviews: Review[]): CardState {
  return reviews.reduce(applyReview, NEW_CARD);
}

export function isNew(card: Pick<Flashcard, 'reviews'>): boolean {
  return card.reviews.length === 0;
}

/** À revoir ce jour : une carte déjà vue dont l'échéance est arrivée. */
export function isDue(card: Pick<Flashcard, 'reviews'>, today: string): boolean {
  const { due } = cardState(card.reviews);
  return due !== null && due <= today;
}

/** Nouvelles cartes encore possibles aujourd'hui : 20, moins celles vues pour la première fois aujourd'hui. */
export function newLeftToday(cards: Pick<Flashcard, 'reviews'>[], today: string, perDay = NEW_PER_DAY): number {
  const startedToday = cards.filter((card) => card.reviews[0]?.reviewedOn === today).length;
  return Math.max(0, perDay - startedToday);
}

/**
 * Les cartes du jour : celles à revoir (la plus en retard d'abord), puis les nouvelles, dans l'ordre de
 * création, dans la limite du jour.
 */
export function todayQueue<T extends Pick<Flashcard, 'reviews' | 'createdAt'>>(cards: T[], today: string, perDay = NEW_PER_DAY): T[] {
  const due = cards
    .filter((card) => isDue(card, today))
    .sort((a, b) => (cardState(a.reviews).due ?? '').localeCompare(cardState(b.reviews).due ?? ''));
  const fresh = cards.filter(isNew).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, newLeftToday(cards, today, perDay));
  return [...due, ...fresh];
}

/** « Dans 3 jours » : quand une carte reviendra après cette note (montré sous les boutons). */
export function nextIntervalLabel(card: Pick<Flashcard, 'reviews'>, rating: Rating, today: string): string {
  const next = applyReview(cardState(card.reviews), { reviewedOn: today, rating });
  if (next.interval === 0) return 'aujourd’hui';
  if (next.interval === 1) return 'demain';
  if (next.interval < 30) return `${next.interval} j`;
  return `${Math.round(next.interval / 30)} mois`;
}

// ─── Cartes tirées d'une page ───────────────────────────────────────────────

/** Une ligne « question :: réponse » d'une page. */
export function cardsFromText(text: string): { front: string; back: string }[] {
  const seen = new Set<string>();
  const cards: { front: string; back: string }[] = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf('::');
    if (at <= 0) continue;
    const front = line.slice(0, at).trim();
    const back = line.slice(at + 2).trim();
    if (!front || !back || seen.has(front)) continue;
    seen.add(front);
    cards.push({ front, back });
  }
  return cards;
}

/**
 * Ce que changent les lignes d'une page sur ses cartes : les nouvelles questions deviennent des cartes,
 * une réponse modifiée met la carte à jour. Une ligne retirée ne supprime rien (on garde l'historique).
 */
export function syncPlan(
  lines: { front: string; back: string }[],
  existing: Pick<Flashcard, 'id' | 'front' | 'back'>[],
): { create: { front: string; back: string }[]; update: { id: string; back: string }[] } {
  const byFront = new Map(existing.map((card) => [card.front, card]));
  const create: { front: string; back: string }[] = [];
  const update: { id: string; back: string }[] = [];
  for (const line of lines) {
    const card = byFront.get(line.front);
    if (!card) create.push(line);
    else if (card.back !== line.back) update.push({ id: card.id, back: line.back });
  }
  return { create, update };
}

/** « 12 cartes à revoir » */
export function dueSummary(count: number): string {
  return count === 0 ? 'Rien à revoir aujourd’hui' : `${count} carte${count > 1 ? 's' : ''} à revoir`;
}
