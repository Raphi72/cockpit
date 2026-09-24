import { CalendarClock, Flag } from 'lucide-react';
import { memo, type CSSProperties, type HTMLAttributes, type Ref } from 'react';
import { relativeDateLabel, toISODate } from '@/core/dates';
import { ColorDot } from '@/ui/data/ColorDot';
import { useUpdateTask } from '../hooks';
import { taskDateLabel, type TaskItem } from '../model';
import { useTaskSheet } from '../sheet-store';
import { TaskCheckbox } from './TaskCheckbox';

const TONE: Record<'late' | 'soon' | 'normal', string> = {
  late: 'text-danger',
  soon: 'text-warning',
  normal: 'text-ink-3',
};

type TaskRowProps = {
  task: TaskItem;
  today: string;
  /** Afficher le projet (vues globales) ; inutile dans la fiche d'un projet. */
  showProject?: boolean;
  /** Pour une tâche terminée : afficher quand elle l'a été. */
  showCompletion?: boolean;
  /** Propriétés de glisser-déposer, fournies par la liste triable. */
  dragProps?: HTMLAttributes<HTMLDivElement>;
  dragRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragging?: boolean;
};

/** Ligne de tâche : case, titre, puis seulement le projet et la date qui compte. */
export const TaskRow = memo(function TaskRow({
  task,
  today,
  showProject = true,
  showCompletion = false,
  dragProps,
  dragRef,
  style,
  dragging = false,
}: TaskRowProps) {
  const update = useUpdateTask();
  const openTask = useTaskSheet((state) => state.openTask);
  const done = task.status === 'done';
  const date = taskDateLabel(task, today);
  const toggle = () => update.mutate({ id: task.id, patch: { status: done ? 'todo' : 'done' } });

  return (
    <div
      ref={dragRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') openTask(task.id);
        if (event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      }}
      {...dragProps}
      className={
        '-mx-2.5 grid min-h-11 cursor-default grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-md px-2.5 outline-none ' +
        'transition-colors duration-[120ms] ease-soft hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent-soft ' +
        (dragging ? 'relative z-10 bg-elevated shadow-overlay' : '')
      }
    >
      <TaskCheckbox status={task.status} onToggle={toggle} />
      <span className="flex min-w-0 items-center gap-2.5">
        {task.priority >= 2 && !done && (
          <span
            title={task.priority === 3 ? 'Urgente' : 'Haute'}
            className={`size-1.5 shrink-0 rounded-full ${task.priority === 3 ? 'bg-danger' : 'bg-warning'}`}
          />
        )}
        <span className={`truncate ${done ? 'text-ink-3 line-through decoration-line-strong' : ''}`}>{task.title}</span>
      </span>
      <span className="flex items-center gap-4 text-meta text-ink-3">
        {showProject && task.projectName && (
          <span className="flex max-w-[200px] items-center gap-2">
            {task.projectColor && <ColorDot color={task.projectColor} />}
            <span className="truncate">{task.projectName}</span>
          </span>
        )}
        {date && (
          <span className={`tnum flex items-center gap-1.5 ${TONE[date.tone]}`} title={date.kind === 'due' ? 'Deadline' : 'Prévue le'}>
            {date.kind === 'due' ? (
              <Flag className="size-3.5" strokeWidth={1.75} />
            ) : (
              <CalendarClock className="size-3.5" strokeWidth={1.75} />
            )}
            {date.label}
          </span>
        )}
        {showCompletion && done && task.completedAt && (
          <span className="tnum">{relativeDateLabel(toISODate(new Date(task.completedAt)), today)}</span>
        )}
      </span>
    </div>
  );
});
