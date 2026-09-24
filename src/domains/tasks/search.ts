export type TaskView = 'today' | 'upcoming' | 'overdue' | 'priority' | 'all' | 'done';

export const TASK_VIEWS: TaskView[] = ['today', 'upcoming', 'overdue', 'priority', 'all', 'done'];

export const TASK_VIEW_LABELS: Record<TaskView, string> = {
  today: 'Aujourd’hui',
  upcoming: '7 jours',
  overdue: 'En retard',
  priority: 'Prioritaires',
  all: 'Toutes',
  done: 'Terminées',
};

/** Vue de la page Tâches, gardée dans l'URL interne (« Aujourd'hui » par défaut). */
export type TasksSearch = { view?: Exclude<TaskView, 'today'> };

export function validateTasksSearch(search: Record<string, unknown>): TasksSearch {
  const view = TASK_VIEWS.find((v) => v === search.view);
  return { view: view && view !== 'today' ? view : undefined };
}
