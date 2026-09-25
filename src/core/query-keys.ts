/**
 * Clés TanStack Query centralisées. Chaque domaine a une racine (`projects`, `clients`…) :
 * invalider la racine rafraîchit toutes ses listes et fiches.
 */
export const queryKeys = {
  appInfo: ['app-info'] as const,
  /** Un réglage de la table `settings`. */
  settings: (key: string) => ['settings', key] as const,
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
  tasks: {
    all: ['tasks'] as const,
    open: ['tasks', 'open'] as const,
    done: (options: object) => ['tasks', 'done', options] as const,
    project: (projectId: string) => ['tasks', 'project', projectId] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    byProject: (projectId: string) => ['payments', 'project', projectId] as const,
    detail: (id: string) => ['payments', 'detail', id] as const,
    overdue: (today: string) => ['payments', 'overdue', today] as const,
    open: ['payments', 'open'] as const,
    received: ['payments', 'received'] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (filter: object) => ['transactions', 'list', filter] as const,
    byProject: (projectId: string) => ['transactions', 'project', projectId] as const,
    group: (id: string) => ['transactions', 'group', id] as const,
    detail: (id: string) => ['transactions', 'detail', id] as const,
  },
  /**
   * Calendrier : il agrège les événements, les projets, les tâches et les encaissements.
   * Toute écriture sur l'une de ces sources invalide la racine `agenda`.
   */
  agenda: {
    all: ['agenda'] as const,
    range: (from: string, to: string) => ['agenda', 'range', from, to] as const,
    event: (id: string) => ['agenda', 'event', id] as const,
  },
  /**
   * Recherche globale (palette Ctrl+K) : elle lit tous les domaines, donc elle n'est jamais
   * gardée en cache longtemps (staleTime 0) au lieu d'être invalidée par chaque écriture.
   */
  search: (text: string, today: string) => ['search', text, today] as const,
  /** Soldes, chiffres de l'en-tête et catégories. */
  finance: {
    all: ['finance'] as const,
    accounts: ['finance', 'accounts'] as const,
    summary: (today: string) => ['finance', 'summary', today] as const,
    categories: ['finance', 'categories'] as const,
    /** Faut-il encore demander les soldes de départ ? */
    needsInitialBalances: ['finance', 'needs-initial-balances'] as const,
  },
};
