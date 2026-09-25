import { nestTasks, type TaskItem } from '../model';
import { TaskRow } from './TaskRow';

type TaskListProps = {
  tasks: TaskItem[];
  today: string;
  showProject?: boolean;
  showCompletion?: boolean;
  /** Jour que montre la liste : une date prévue ce jour-là n'est pas répétée. */
  shownDay?: string;
  /** Vrai : une sous-tâche dont la parente est dans la liste est rangée juste sous elle, en retrait. */
  nested?: boolean;
};

/** Liste de tâches (vues globales, fiche projet repliée…), sans glisser-déposer. */
export function TaskList({ tasks, today, showProject = true, showCompletion = false, shownDay, nested = false }: TaskListProps) {
  const rows = nested ? nestTasks(tasks) : tasks.map((task) => ({ task, depth: 0 as const }));
  return (
    <>
      {rows.map(({ task, depth }) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          depth={depth}
          showParent={depth === 0}
          showProject={showProject}
          showCompletion={showCompletion}
          shownDay={shownDay}
        />
      ))}
    </>
  );
}
