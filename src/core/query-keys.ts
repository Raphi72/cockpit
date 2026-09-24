/**
 * Clés TanStack Query centralisées. Chaque domaine a une racine (`projects`, `clients`…) :
 * invalider la racine rafraîchit toutes ses listes et fiches.
 */
export const queryKeys = {
  appInfo: ['app-info'] as const,
  projectTypes: ['project-types'] as const,
  projects: {
    all: ['projects'] as const,
    list: (filter: object) => ['projects', 'list', filter] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
  },
  clients: {
    all: ['clients'] as const,
    list: ['clients', 'list'] as const,
    projects: (id: string) => ['clients', 'projects', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    byProject: (projectId: string) => ['payments', 'project', projectId] as const,
    overdue: (today: string) => ['payments', 'overdue', today] as const,
  },
};
