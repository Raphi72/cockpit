import { addDaysISO, daysBetween } from '@/core/dates';
import { dayHeading, isHomework, nestTasks, type TaskItem } from '@/domains/tasks/model';

/**
 * Devoirs (P14) : des tâches rattachées à une matière. Leur date principale est la deadline, le
 * jour où ils sont à rendre. Ces règles ne font que trier des tâches déjà chargées.
 */

export type HomeworkView = 'todo' | 'done';

/** Vue de la page Devoirs, gardée dans l'URL interne (« À rendre » par défaut). */
export type HomeworkSearch = { view?: 'done' };

export function validateHomeworkSearch(search: Record<string, unknown>): HomeworkSearch {
  return search.view === 'done' ? { view: 'done' } : {};
}

export type HomeworkGroup = { key: string; heading: string; tone: 'danger' | 'default'; tasks: TaskItem[] };

/** Jour de rendu d'un devoir ; une sous-tâche sans date suit sa parente. */
function dueOf(task: TaskItem, byId: Map<string, TaskItem>): string | null {
  return task.dueDate ?? (task.parentId ? (byId.get(task.parentId)?.dueDate ?? null) : null);
}

function headingFor(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return 'À rendre aujourd’hui';
  return dayHeading(due, today);
}

/**
 * Devoirs à rendre, groupés : en retard, aujourd'hui, puis jour par jour ; ceux sans date à la fin.
 * Dans un groupe, les plus prioritaires d'abord, puis l'ordre de saisie ; une sous-tâche suit sa parente.
 */
export function groupHomework(open: TaskItem[], today: string): HomeworkGroup[] {
  const homework = open.filter((t) => isHomework(t) && t.status !== 'done');
  const byId = new Map(homework.map((t) => [t.id, t]));
  const groups = new Map<string, HomeworkGroup>();
  const add = (key: string, heading: string, tone: HomeworkGroup['tone'], task: TaskItem) => {
    const group = groups.get(key) ?? { key, heading, tone, tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  };
  for (const task of homework) {
    const due = dueOf(task, byId);
    if (due === null) add('none', 'Sans date', 'default', task);
    else if (due < today) add('late', 'En retard', 'danger', task);
    else add(due, headingFor(due, today), 'default', task);
  }
  const order = (key: string) => (key === 'late' ? '0' : key === 'none' ? '9' : `1${key}`);
  return [...groups.values()]
    .sort((a, b) => order(a.key).localeCompare(order(b.key)))
    .map((group) => {
      const sorted = group.tasks.sort((a, b) => b.priority - a.priority || a.sortOrder - b.sortOrder);
      // Chaque sous-tâche juste sous sa parente.
      return { ...group, tasks: nestTasks(sorted).map((row) => row.task) };
    });
}

/** « 3 à rendre · 1 en retard » (seulement les devoirs principaux, pas leurs sous-tâches). */
export function homeworkSummary(open: TaskItem[], today: string): string {
  const main = open.filter((t) => isHomework(t) && t.status !== 'done' && t.parentId === null);
  const late = main.filter((t) => t.dueDate !== null && t.dueDate < today).length;
  if (main.length === 0) return 'Aucun devoir à rendre.';
  return [`${main.length} à rendre`, late > 0 ? `${late} en retard` : null].filter(Boolean).join(' · ');
}

/** Devoirs à rendre dans les `days` prochains jours (aujourd'hui compris) et ceux en retard : le dashboard Cours. */
export function selectHomeworkDue(open: TaskItem[], today: string, days: number): TaskItem[] {
  const last = addDaysISO(today, days);
  return open
    .filter((t) => isHomework(t) && t.status !== 'done' && t.parentId === null && t.dueDate !== null && t.dueDate < last)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || b.priority - a.priority || a.sortOrder - b.sortOrder);
}
