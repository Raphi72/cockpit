import { useState, type KeyboardEvent } from 'react';
import { create } from 'zustand';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { Dialog, DialogFooter } from '@/ui/overlays/Dialog';
import { Button } from '@/ui/primitives/Button';
import { Kbd } from '@/ui/primitives/Kbd';
import { useReviewCard } from '../hooks';
import { RATINGS, nextIntervalLabel, type Flashcard, type Rating } from '../model';

/** La session ouverte (cartes du jour d'une matière, ou de toutes), montée une fois dans l'AppShell. */
type SessionState = { cards: Flashcard[] | null; title: string; start: (cards: Flashcard[], title: string) => void; close: () => void };

export const useRevisionSession = create<SessionState>()((set) => ({
  cards: null,
  title: '',
  start: (cards, title) => set({ cards, title }),
  close: () => set({ cards: null }),
}));

const RATING_TONE: Record<Rating, string> = {
  1: 'hover:border-danger hover:text-danger',
  2: 'hover:border-warning hover:text-warning',
  3: 'hover:border-accent hover:text-accent',
  4: 'hover:border-success hover:text-success',
};

/**
 * Une session au clavier : la question, Espace pour voir la réponse, puis 1 à 4 pour se noter. Une
 * carte « à revoir » repasse à la fin de la session. Chaque note est enregistrée tout de suite.
 */
function Session({ initial, onDone }: { initial: Flashcard[]; onDone: () => void }) {
  const today = useToday();
  const review = useReviewCard();
  const [queue, setQueue] = useState(initial);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const card = queue[0];
  const total = Object.values(done).reduce((a, b) => a + b, 0);

  const rate = (rating: Rating) => {
    if (!card || !flipped) return;
    review.mutate({ cardId: card.id, rating, today });
    setDone((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    // Une carte à revoir revient à la fin, avec sa nouvelle révision.
    const rest = queue.slice(1);
    setQueue(rating === 1 ? [...rest, { ...card, reviews: [...card.reviews, { reviewedOn: today, rating }] }] : rest);
    setFlipped(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!card) onDone();
      else setFlipped(true);
      return;
    }
    const rating = RATINGS.find((r) => r.key === event.key || event.code === `Digit${r.key}` || event.code === `Numpad${r.key}`);
    if (rating) {
      event.preventDefault();
      rate(rating.rating);
    }
  };

  if (!card) {
    return (
      <div tabIndex={-1} onKeyDown={onKeyDown} className="mt-6 outline-none">
        <p className="text-[17px] font-semibold">Session terminée.</p>
        <p className="mt-1 text-ink-2">
          {total} révision{total > 1 ? 's' : ''} : {done[4] + done[3]} réussie{done[4] + done[3] > 1 ? 's' : ''}
          {done[1] > 0 && `, ${done[1]} à revoir`}.
        </p>
        <DialogFooter>
          <Button variant="primary" onClick={onDone} autoFocus>
            Fermer
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div tabIndex={-1} onKeyDown={onKeyDown} className="mt-4 outline-none" ref={(node) => node?.focus()}>
      <div className="flex items-center gap-2 text-meta text-ink-3">
        <ColorDot color={card.subjectColor} />
        {card.subjectName}
        <span className="tnum ml-auto">{queue.length} restante{queue.length > 1 ? 's' : ''}</span>
      </div>
      <div className="mt-4 min-h-[180px] rounded-lg border border-line px-6 py-8 text-center">
        <p className="text-[19px] leading-snug font-medium whitespace-pre-wrap">{card.front}</p>
        {flipped && (
          <>
            <hr className="mx-auto my-6 w-16 border-line" />
            <p className="text-[17px] leading-snug whitespace-pre-wrap text-ink-2">{card.back}</p>
          </>
        )}
      </div>
      {flipped ? (
        <div className="mt-5 grid grid-cols-4 gap-2">
          {RATINGS.map(({ rating, label, key }) => (
            <button
              key={rating}
              type="button"
              onClick={() => rate(rating)}
              className={`flex flex-col items-center gap-0.5 rounded-md border border-line py-2 transition-colors duration-[120ms] ease-soft ${RATING_TONE[rating]}`}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {label} <Kbd>{key}</Kbd>
              </span>
              <span className="text-meta text-ink-3">{nextIntervalLabel(card, rating, today)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" shortcut="Espace" onClick={() => setFlipped(true)}>
            Voir la réponse
          </Button>
        </div>
      )}
    </div>
  );
}

export function RevisionSessionDialog() {
  const cards = useRevisionSession((state) => state.cards);
  const title = useRevisionSession((state) => state.title);
  const close = useRevisionSession((state) => state.close);
  return (
    <Dialog open={cards !== null} onOpenChange={(open) => !open && close()} title={title} width={600}>
      {cards && <Session initial={cards} onDone={close} />}
    </Dialog>
  );
}
