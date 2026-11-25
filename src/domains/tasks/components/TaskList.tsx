import { AnimatedRows } from '@/ui/motion/AnimatedRows';
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
  /** Programme du jour : « Retirer du programme » au survol de chaque ligne. */
  onUnplan?: (task: TaskItem) => void;
};

/**
 * Liste de tâches (vues globales, fiche projet repliée…), sans glisser-déposer. Une tâche ajoutée
 * ouvre sa ligne, une tâche supprimée ou sortie de la vue la replie : les suivantes glissent.
 */
export function TaskList({
  tasks,
  today,
  showProject = true,
  showCompletion = false,
  shownDay,
  nested = false,
  onUnplan,
}: TaskListProps) {
  const rows = nested ? nestTasks(tasks) : tasks.map((task) => ({ task, depth: 0 as const }));
  return (
    <AnimatedRows items={rows} getKey={(row) => row.task.id}>
      {({ task, depth }) => (
        <TaskRow
          task={task}
          today={today}
          depth={depth}
          showParent={depth === 0}
          showProject={showProject}
          showCompletion={showCompletion}
          shownDay={shownDay}
          onUnplan={onUnplan && (() => onUnplan(task))}
        />
      )}
    </AnimatedRows>
  );
}
