import { describe, expect, it } from 'vitest';
import { revisionDays, revisionSlot } from '@/domains/school/exams/revision-plan';
import {
  NEW_CARD,
  applyReview,
  cardState,
  cardsFromText,
  isDue,
  newLeftToday,
  nextIntervalLabel,
  syncPlan,
  todayQueue,
  type Flashcard,
  type Review,
} from '@/domains/school/flashcards/model';
import { insertCardStatement, insertReviewStatement, listFlashcards } from '@/domains/school/flashcards/repository';
import { normalizeSubject } from '@/domains/school/subjects/model';
import { insertSubjectStatement } from '@/domains/school/subjects/repository';
import { createTestDb } from './support/test-db';

const NOW = '2026-11-26T10:00:00.000Z';
const TODAY = '2026-11-26';

let n = 0;
const card = (reviews: Review[], createdAt = `2026-11-${String(10 + (n % 10)).padStart(2, '0')}T10:00:00.000Z`): Flashcard => ({
  id: `c${++n}`,
  subjectId: 'maths',
  subjectName: 'Maths',
  subjectColor: 'blue',
  pageId: null,
  front: `Q${n}`,
  back: `R${n}`,
  createdAt,
  reviews,
});

describe('répétition espacée', () => {
  it('fait grandir l’intervalle quand on sait, et repart de zéro sinon', () => {
    const first = applyReview(NEW_CARD, { reviewedOn: TODAY, rating: 3 });
    expect(first).toMatchObject({ reps: 1, interval: 1, due: '2026-11-27' });
    const second = applyReview(first, { reviewedOn: '2026-11-27', rating: 3 });
    expect(second).toMatchObject({ reps: 2, interval: 3, due: '2026-11-30' });
    const third = applyReview(second, { reviewedOn: '2026-11-30', rating: 3 });
    expect(third.interval).toBe(8); // 3 × 2,5 arrondi
    const lapse = applyReview(third, { reviewedOn: '2026-12-08', rating: 1 });
    expect(lapse).toMatchObject({ reps: 0, interval: 0, due: '2026-12-08', lapses: 1, ease: 2.3 });
    expect(applyReview(NEW_CARD, { reviewedOn: TODAY, rating: 4 })).toMatchObject({ interval: 3, ease: 2.65 });
    expect(applyReview(NEW_CARD, { reviewedOn: TODAY, rating: 2 }).ease).toBe(2.35);
  });

  it('rejoue l’historique d’une carte', () => {
    expect(cardState([])).toEqual(NEW_CARD);
    expect(cardState([{ reviewedOn: '2026-11-20', rating: 3 }, { reviewedOn: '2026-11-21', rating: 3 }]).due).toBe('2026-11-24');
    expect(isDue(card([{ reviewedOn: '2026-11-20', rating: 3 }]), TODAY)).toBe(true);
    expect(isDue(card([{ reviewedOn: TODAY, rating: 4 }]), TODAY)).toBe(false);
    expect(isDue(card([]), TODAY)).toBe(false);
  });

  it('compose la file du jour : les retards d’abord, puis 20 nouvelles au plus', () => {
    const late = card([{ reviewedOn: '2026-11-10', rating: 3 }]);
    const lessLate = card([{ reviewedOn: '2026-11-24', rating: 3 }]);
    const started = card([{ reviewedOn: TODAY, rating: 1 }]);
    const fresh = Array.from({ length: 25 }, (_, i) => card([], `2026-11-01T10:${String(i).padStart(2, '0')}:00.000Z`));
    const queue = todayQueue([lessLate, ...fresh, late, started], TODAY);
    expect(queue.slice(0, 3).map((c) => c.id)).toEqual([late.id, lessLate.id, started.id]);
    // Une carte commencée aujourd'hui compte dans les 20 nouvelles du jour.
    expect(newLeftToday([started, ...fresh], TODAY)).toBe(19);
    expect(queue).toHaveLength(3 + 19);
    expect(queue[3]?.id).toBe(fresh[0]?.id);
    expect(nextIntervalLabel(card([]), 1, TODAY)).toBe('aujourd’hui');
    expect(nextIntervalLabel(card([]), 3, TODAY)).toBe('demain');
    expect(nextIntervalLabel(card([]), 4, TODAY)).toBe('3 j');
  });
});

describe('cartes tirées d’une page', () => {
  it('lit les lignes « question :: réponse »', () => {
    expect(cardsFromText('Titre\nBastille :: 14 juillet 1789\n:: sans question\nPas de séparateur\nBastille :: doublon\n  Varennes ::  1791 ')).toEqual([
      { front: 'Bastille', back: '14 juillet 1789' },
      { front: 'Varennes', back: '1791' },
    ]);
  });

  it('crée les nouvelles questions et met à jour les réponses changées, sans rien supprimer', () => {
    const plan = syncPlan(
      [
        { front: 'Bastille', back: '14 juillet 1789' },
        { front: 'Varennes', back: 'juin 1791' },
        { front: 'Valmy', back: '1792' },
      ],
      [
        { id: 'a', front: 'Bastille', back: '14 juillet 1789' },
        { id: 'b', front: 'Varennes', back: '1791' },
        { id: 'c', front: 'Ancienne', back: 'retirée de la page' },
      ],
    );
    expect(plan).toEqual({ create: [{ front: 'Valmy', back: '1792' }], update: [{ id: 'b', back: 'juin 1791' }] });
  });
});

describe('révisions à rebours', () => {
  it('garde les jours encore à venir', () => {
    expect(revisionDays('2026-12-03', TODAY).map((d) => [d.offset, d.day])).toEqual([
      [7, '2026-11-26'],
      [3, '2026-11-30'],
      [1, '2026-12-02'],
    ]);
    expect(revisionDays('2026-11-28', TODAY).map((d) => d.offset)).toEqual([1]);
  });

  it('prend le premier créneau libre du soir, sinon 18 h', () => {
    expect(revisionSlot([])).toEqual({ start: 17 * 60, end: 18 * 60, taken: false });
    expect(revisionSlot([{ start: 17 * 60, end: 19 * 60 + 10 }])).toEqual({ start: 19 * 60 + 15, end: 20 * 60 + 15, taken: false });
    expect(revisionSlot([{ start: 16 * 60, end: 23 * 60 }])).toEqual({ start: 18 * 60, end: 19 * 60, taken: true });
    // Aujourd'hui, pas avant l'heure qu'il est.
    expect(revisionSlot([], 20 * 60 + 5)).toEqual({ start: 20 * 60 + 15, end: 21 * 60 + 15, taken: false });
  });
});

describe('flashcards : base', () => {
  it('lit les cartes avec leurs révisions dans l’ordre', async () => {
    const { db } = createTestDb();
    await db.batch([
      insertSubjectStatement('maths', normalizeSubject({ name: 'Maths', color: 'blue', teacher: '', room: '', coefficient: '1' }), NOW),
      insertCardStatement('c1', { subjectId: 'maths', pageId: null, front: ' Pythagore ', back: 'a² + b² = c²' }, NOW),
      insertReviewStatement('r1', 'c1', '2026-11-20', 3, '2026-11-20T10:00:00.000Z'),
      insertReviewStatement('r2', 'c1', '2026-11-21', 1, '2026-11-21T10:00:00.000Z'),
    ]);
    const [first] = await listFlashcards(db, 'maths');
    expect(first).toMatchObject({ front: 'Pythagore', subjectName: 'Maths', reviews: [{ reviewedOn: '2026-11-20', rating: 3 }, { reviewedOn: '2026-11-21', rating: 1 }] });
    expect(isDue(first!, TODAY)).toBe(true);
  });
});
