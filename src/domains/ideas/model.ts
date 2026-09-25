/**
 * Idée de projet : notée pour plus tard, sans date ni statut. Ce n'est pas une tâche,
 * mais elle peut en devenir une ; elle quitte alors la liste des idées.
 */
export type Idea = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
};

/** Titre enregistré, ou `null` s'il est vide. */
export function cleanIdeaTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed === '' ? null : trimmed;
}
