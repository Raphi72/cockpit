import { Link } from '@tanstack/react-router';
import { Layers } from 'lucide-react';
import { useToday } from '@/core/use-today';
import { ColorDot } from '@/ui/data/ColorDot';
import { EmptyState } from '@/ui/layout/EmptyState';
import { Page } from '@/ui/layout/Page';
import { Button } from '@/ui/primitives/Button';
import { useRevisionSession } from '../flashcards/components/RevisionSession';
import { useFlashcards } from '../flashcards/hooks';
import { dueSummary, isNew, todayQueue } from '../flashcards/model';
import { useSubjects } from '../subjects/hooks';

/**
 * Révisions : les cartes à revoir aujourd'hui, matière par matière (les nouvelles, 20 par jour au plus),
 * et une session pour tout réviser d'un coup.
 */
export function RevisionsPage() {
  const today = useToday();
  const start = useRevisionSession((state) => state.start);
  const { data: cards } = useFlashcards();
  const { data: subjects } = useSubjects();
  if (!cards || !subjects) return null;

  const queue = todayQueue(cards, today);
  const bySubject = subjects
    .map((subject) => {
      const mine = cards.filter((c) => c.subjectId === subject.id);
      const due = queue.filter((c) => c.subjectId === subject.id);
      return { subject, total: mine.length, due, fresh: due.filter(isNew).length };
    })
    .filter((line) => line.total > 0);

  return (
    <Page
      title="Révisions"
      subtitle={cards.length > 0 ? dueSummary(queue.length) : undefined}
      actions={
        queue.length > 0 && (
          <Button variant="primary" onClick={() => start(queue, 'Révision du jour')}>
            Tout réviser ({queue.length})
          </Button>
        )
      }
    >
      {cards.length === 0 ? (
        <EmptyState icon={Layers} title="Aucune flashcard pour l’instant">
          <p>Ajoute des cartes dans la fiche d’une matière, ou écris des lignes « question :: réponse » dans une page rattachée à une matière, puis choisis « Créer les flashcards » dans son menu.</p>
          <p className="mt-1">Chaque jour, Cockpit te dit quelles cartes revoir : Espace pour voir la réponse, puis 1 à 4 pour te noter.</p>
        </EmptyState>
      ) : (
        <ul>
          {bySubject.map(({ subject, total, due, fresh }) => (
            <li key={subject.id} className="-mx-2.5 grid min-h-12 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-6 rounded-md px-2.5 hover:bg-hover">
              <Link to="/subjects/$subjectId" params={{ subjectId: subject.id }} className="flex min-w-0 items-center gap-3">
                <ColorDot color={subject.color} />
                <span className="truncate">{subject.name}</span>
                <span className="text-meta text-ink-3">
                  {total} carte{total > 1 ? 's' : ''}
                </span>
              </Link>
              <span className="tnum text-meta text-ink-2">
                {due.length === 0
                  ? 'À jour'
                  : [due.length > fresh ? `${due.length - fresh} à revoir` : null, fresh > 0 ? `${fresh} nouvelle${fresh > 1 ? 's' : ''}` : null]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
              <Button variant="ghost" disabled={due.length === 0} onClick={() => start(due, `Révision · ${subject.name}`)}>
                Réviser
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
