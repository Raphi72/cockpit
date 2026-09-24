/** Filtres de la page Projets, gardés dans l'URL interne : on les retrouve en revenant d'une fiche. */
export type ProjectsSearch = { view?: 'closed'; type?: string };

export function validateProjectsSearch(search: Record<string, unknown>): ProjectsSearch {
  return {
    view: search.view === 'closed' ? 'closed' : undefined,
    type: typeof search.type === 'string' ? search.type : undefined,
  };
}
