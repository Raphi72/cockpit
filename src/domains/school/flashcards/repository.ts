import type { Db, Statement } from '@/core/db';
import type { Flashcard, Rating, Review } from './model';

type CardRow = Omit<Flashcard, 'reviews'>;

/** Les cartes (d'une matière, ou toutes), avec leurs révisions dans l'ordre. */
export async function listFlashcards(db: Db, subjectId?: string): Promise<Flashcard[]> {
  const where = subjectId ? 'WHERE f.subject_id = ?' : '';
  const params = subjectId ? [subjectId] : [];
  const [cards, reviews] = await Promise.all([
    db.query<CardRow>(
      `SELECT f.id, f.subject_id, s.name AS subject_name, s.color AS subject_color, f.page_id, f.front, f.back, f.created_at
       FROM flashcards f JOIN subjects s ON s.id = f.subject_id ${where}
       ORDER BY f.created_at`,
      params,
    ),
    db.query<Review & { cardId: string }>(
      `SELECT r.card_id, r.reviewed_on, r.rating FROM flashcard_reviews r
       JOIN flashcards f ON f.id = r.card_id ${where}
       ORDER BY r.created_at`,
      params,
    ),
  ]);
  const byCard = new Map<string, Review[]>();
  for (const { cardId, reviewedOn, rating } of reviews) byCard.set(cardId, [...(byCard.get(cardId) ?? []), { reviewedOn, rating }]);
  return cards.map((card) => ({ ...card, reviews: byCard.get(card.id) ?? [] }));
}

/** Les cartes nées d'une page (pour la mettre à jour). */
export function listPageCards(db: Db, pageId: string): Promise<{ id: string; front: string; back: string }[]> {
  return db.query('SELECT id, front, back FROM flashcards WHERE page_id = ?', [pageId]);
}

export function insertCardStatement(
  id: string,
  card: { subjectId: string; pageId: string | null; front: string; back: string },
  now: string,
): Statement {
  return {
    sql: 'INSERT INTO flashcards (id, subject_id, page_id, front, back, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [id, card.subjectId, card.pageId, card.front.trim(), card.back.trim(), now, now],
  };
}

export function updateCardStatement(id: string, patch: { front?: string; back?: string }, now: string): Statement {
  const keys = Object.keys(patch) as ('front' | 'back')[];
  return {
    sql: `UPDATE flashcards SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    params: [...keys.map((k) => patch[k]!.trim()), now, id],
  };
}

export function deleteCardStatement(id: string): Statement {
  return { sql: 'DELETE FROM flashcards WHERE id = ?', params: [id] };
}

export function insertReviewStatement(id: string, cardId: string, reviewedOn: string, rating: Rating, now: string): Statement {
  return {
    sql: 'INSERT INTO flashcard_reviews (id, card_id, reviewed_on, rating, created_at) VALUES (?, ?, ?, ?, ?)',
    params: [id, cardId, reviewedOn, rating, now],
  };
}

export function deleteReviewStatement(id: string): Statement {
  return { sql: 'DELETE FROM flashcard_reviews WHERE id = ?', params: [id] };
}

/** Une carte telle qu'elle est en base, avec ses révisions, pour « Annuler » une suppression. */
export async function readCardSnapshot(db: Db, id: string) {
  const card = await db.queryOne<Record<string, unknown>>('SELECT * FROM flashcards WHERE id = ?', [id]);
  const reviews = await db.query<Record<string, unknown>>('SELECT * FROM flashcard_reviews WHERE card_id = ? ORDER BY rowid', [id]);
  return card ? { card, reviews } : null;
}
