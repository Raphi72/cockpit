import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/query-keys';

/**
 * Après une écriture de l'espace Cours : ses listes, l'agenda (cours et examens dans le calendrier et
 * le dashboard) et les tâches (le nom et la couleur d'une matière s'affichent sur ses devoirs).
 */
export function invalidateSchool(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
}
