import { CalendarClock, Flag, ListPlus } from 'lucide-react';
import { memo, type CSSProperties, type HTMLAttributes, type MouseEvent, type Ref } from 'react';
import { relativeDateLabel, toISODate } from '@/core/dates';
import { ColorDot } from '@/ui/data/ColorDot';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { handleRowKeyDown } from '@/ui/data/row-keys';
import { useDeleteTask, useUpdateTask } from '../hooks';
import { taskDateLabel, type TaskItem } from '../model';
import { TASK_ROW_ATTRIBUTE, useTaskSelection } from '../selection-store';
import { useTaskSheet } from '../sheet-store';
import { TaskCheckbox } from './TaskCheckbox';

type TaskRowProps = {
  task: TaskItem;
  today: string;
  /** Afficher le projet (vues globales) ; inutile dans la fiche d'un projet. */
  showProject?: boolean;
  /** Afficher « Parente › » devant une sous-tâche ; inutile quand elle est rangée sous sa parente. */
  showParent?: boolean;
  /** 1 : sous-tâche rangée sous sa parente, en retrait. */
  depth?: 0 | 1;
  /** Pour une tâche terminée : afficher quand elle l'a été. */
  showCompletion?: boolean;
  /** Jour que montre la liste : une date prévue ce jour-là n'est pas répétée sur la ligne. */
  shownDay?: string;
  /** Si fourni : « Ajouter une sous-tâche » au survol. */
  onAddSubtask?: () => void;
  /** Propriétés de glisser-déposer, fournies par la liste triable. */
  dragProps?: HTMLAttributes<HTMLDivElement>;
  dragRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragging?: boolean;
};

/**
 * Ligne de tâche : case, titre, puis seulement le projet et la date qui compte.
 * Un clic ouvre la tâche ; Ctrl+clic et Maj+clic la sélectionnent (actions groupées).
 */
export const TaskRow = memo(function TaskRow({
  task,
  today,
  showProject = true,
  showParent = true,
  depth = 0,
  showCompletion = false,
  shownDay,
  onAddSubtask,
  dragProps,
  dragRef,
  style,
  dragging = false,
}: TaskRowProps) {
  const update = useUpdateTask();
  const deleteTask = useDeleteTask();
  const openTask = useTaskSheet((state) => state.openTask);
  const selected = useTaskSelection((state) => state.ids.includes(task.id));
  const done = task.status === 'done';
  const label = taskDateLabel(task, today);
  const date = label?.kind === 'scheduled' && task.scheduledDate === shownDay ? null : label;
  const toggle = () => update.mutate({ id: task.id, patch: { status: done ? 'todo' : 'done' } });

  const onClick = (event: MouseEvent) => {
    const selection = useTaskSelection.getState();
    if (event.ctrlKey || event.metaKey) return selection.toggle(task.id);
    if (event.shiftKey) return selection.selectRange(task.id);
    selection.clear();
    openTask(task.id);
  };

  return (
    <div
      ref={dragRef}
      style={style}
      role="button"
      tabIndex={0}
      data-row
      {...{ [TASK_ROW_ATTRIBUTE]: task.id }}
      aria-selected={selected || undefined}
      // Maj+clic ne doit pas sélectionner le texte de la page.
      onMouseDown={(event) => event.shiftKey && event.preventDefault()}
      onClick={onClick}
      onKeyDown={(event) =>
        handleRowKeyDown(event, { open: () => openTask(task.id), toggle, remove: () => deleteTask.mutate(task) })
      }
      {...dragProps}
      className={
        'group -mx-2.5 grid min-h-11 cursor-default grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-md pr-2.5 outline-none ' +
        'transition-colors duration-[120ms] ease-soft focus-visible:ring-2 focus-visible:ring-accent-soft ' +
        (depth === 1 ? 'pl-[38px] ' : 'pl-2.5 ') +
        (selected ? 'bg-accent-soft ' : 'hover:bg-hover ') +
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
        <span className={`truncate ${done ? 'text-ink-3 line-through decoration-line-strong' : ''}`}>
          {showParent && task.parentTitle && <span className="text-ink-3">{task.parentTitle} › </span>}
          {task.title}
        </span>
        {task.subtasksTotal > 0 && (
          <span className="tnum shrink-0 text-meta text-ink-3" title="Sous-tâches terminées">
            {task.subtasksDone}/{task.subtasksTotal}
          </span>
        )}
      </span>
      <span className="flex items-center gap-4 text-meta text-ink-3">
        {onAddSubtask && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddSubtask();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title="Ajouter une sous-tâche"
            aria-label="Ajouter une sous-tâche"
            className="grid size-7 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity duration-[120ms] ease-soft group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-active hover:text-ink"
          >
            <ListPlus className="size-4" strokeWidth={1.75} />
          </button>
        )}
        {showProject && task.projectName && (
          <span className="flex max-w-[200px] items-center gap-2">
            {task.projectColor && <ColorDot color={task.projectColor} />}
            <span className="truncate">{task.projectName}</span>
          </span>
        )}
        {date && (
          <span className={`tnum flex items-center gap-1.5 ${DEADLINE_TONE_CLASS[date.tone]}`} title={date.kind === 'due' ? 'Deadline' : 'Début'}>
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
