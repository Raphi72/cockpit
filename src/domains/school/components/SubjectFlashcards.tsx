import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { useToday } from '@/core/use-today';
import { Button } from '@/ui/primitives/Button';
import { CardDialog } from '../flashcards/components/CardDialog';
import { useRevisionSession } from '../flashcards/components/RevisionSession';
import { useFlashcards } from '../flashcards/hooks';
import { dueSummary, todayQueue, type Flashcard } from '../flashcards/model';

/** Fiche d'une matière : ses flashcards, celles à revoir aujourd'hui, et de quoi réviser ou en ajouter. */
export function SubjectFlashcards({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const today = useToday();
  const { data: cards = [] } = useFlashcards(subjectId);
  const start = useRevisionSession((state) => state.start);
  const [editing, setEditing] = useState<{ card?: Flashcard } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const queue = todayQueue(cards, today);

  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <h2 className="font-semibold">Flashcards</h2>
        <Button variant="ghost" icon={Plus} className="ml-auto" onClick={() => setEditing({})}>
          Ajouter
        </Button>
      </div>
      {cards.length === 0 ? (
        <p className="py-2 text-ink-3">Aucune carte. Ajoute-en ici, ou écris « question :: réponse » dans une page de la matière.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 py-1">
            <span className="text-ink-2">{dueSummary(queue.length)}</span>
            {queue.length > 0 && (
              <Button variant="secondary" onClick={() => start(queue, `Révision · ${subjectName}`)}>
                Réviser
              </Button>
            )}
          </div>
          <Button
            variant="ghost"
            icon={ChevronRight}
            aria-expanded={showAll}
            onClick={() => setShowAll(!showAll)}
            className={`-ml-3 mt-1 [&>svg]:transition-transform ${showAll ? '[&>svg]:rotate-90' : ''}`}
          >
            {cards.length} carte{cards.length > 1 ? 's' : ''}
          </Button>
          {showAll && (
            <ul>
              {cards.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => setEditing({ card })}
                    className="-mx-2.5 grid min-h-9 w-[calc(100%+20px)] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 rounded-md px-2.5 text-left text-meta hover:bg-hover"
                  >
                    <span className="truncate">{card.front}</span>
                    <span className="truncate text-ink-3">{card.back}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <CardDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} subjectId={subjectId} card={editing?.card} />
    </section>
  );
}
