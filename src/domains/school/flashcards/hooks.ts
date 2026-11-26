import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/core/db';
import { nowTimestamp } from '@/core/dates';
import { reinsertRowStatement } from '@/core/db/rows';
import { newId } from '@/core/ids';
import { queryKeys } from '@/core/query-keys';
import { toast } from '@/ui/overlays/toast';
import { invalidateSchool } from '../invalidate';
import { cardsFromText, syncPlan, type Rating } from './model';
import {
  deleteCardStatement,
  insertCardStatement,
  insertReviewStatement,
  listFlashcards,
  listPageCards,
  readCardSnapshot,
  updateCardStatement,
} from './repository';

/** Les cartes d'une matière, ou toutes (sans `subjectId`). */
export function useFlashcards(subjectId?: string) {
  return useQuery({ queryKey: queryKeys.school.flashcards({ subjectId }), queryFn: () => listFlashcards(db, subjectId) });
}

/** Ajoute une carte (sans `id`) ou la modifie. */
export function useSaveCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, subjectId, front, back }: { id?: string; subjectId: string; front: string; back: string }) =>
      db.batch([
        id ? updateCardStatement(id, { front, back }, nowTimestamp()) : insertCardStatement(newId(), { subjectId, pageId: null, front, back }, nowTimestamp()),
      ]),
    onSuccess: () => invalidateSchool(queryClient),
  });
}

/** Supprimer une carte (et ses révisions) ; « Annuler » remet tout. */
export function useDeleteCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const snapshot = await readCardSnapshot(db, id);
      await db.batch([deleteCardStatement(id)]);
      return snapshot;
    },
    onSuccess: (snapshot) => {
      invalidateSchool(queryClient);
      if (!snapshot) return;
      toast('Carte supprimée.', {
        action: {
          label: 'Annuler',
          undo: true,
          onClick: () =>
            void db
              .batch([reinsertRowStatement('flashcards', snapshot.card), ...snapshot.reviews.map((row) => reinsertRowStatement('flashcard_reviews', row))])
              .then(() => invalidateSchool(queryClient)),
        },
      });
    },
  });
}

/** Une carte notée pendant une session : la révision est enregistrée (son échéance en découle). */
export function useReviewCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, rating, today }: { cardId: string; rating: Rating; today: string }) =>
      db.batch([insertReviewStatement(newId(), cardId, today, rating, nowTimestamp())]),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.school.all }),
  });
}

/**
 * « Créer les flashcards de la page » : chaque ligne « question :: réponse » d'une page rattachée à une
 * matière devient une carte ; une réponse changée met sa carte à jour. Rien n'est supprimé.
 */
export function useSyncPageCards() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pageId, subjectId, text }: { pageId: string; subjectId: string; text: string }) => {
      const plan = syncPlan(cardsFromText(text), await listPageCards(db, pageId));
      const now = nowTimestamp();
      await db.batch([
        ...plan.create.map((card) => insertCardStatement(newId(), { subjectId, pageId, ...card }, now)),
        ...plan.update.map(({ id, back }) => updateCardStatement(id, { back }, now)),
      ]);
      return plan;
    },
    onSuccess: ({ create, update }) => {
      invalidateSchool(queryClient);
      if (create.length === 0 && update.length === 0) {
        toast('Aucune nouvelle carte : écris une ligne « question :: réponse » dans la page.');
        return;
      }
      const parts = [
        create.length > 0 ? `${create.length} carte${create.length > 1 ? 's' : ''} créée${create.length > 1 ? 's' : ''}` : null,
        update.length > 0 ? `${update.length} mise${update.length > 1 ? 's' : ''} à jour` : null,
      ].filter(Boolean);
      toast(`${parts.join(', ')}.`);
    },
  });
}
