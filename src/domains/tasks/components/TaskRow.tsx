import { CalendarClock, CalendarMinus, Flag, ListPlus, type LucideIcon } from 'lucide-react';
import { memo, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type MouseEvent } from 'react';
import { formatCompletedAt, relativeDateLabel, toISODate } from '@/core/dates';
import { ColorDot } from '@/ui/data/ColorDot';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { handleRowKeyDown } from '@/ui/data/row-keys';
import { useCompletingTasks } from '../completion-store';
import { useDeleteTask, useToggleTask } from '../hooks';
import { rowCompletion, taskDateLabel, type RowCompletion, type TaskItem } from '../model';
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
  /**
   * Vrai (par défaut) : la liste ne garde pas les tâches terminées, la ligne s'efface quand on la
   * coche. Faux : elle reste, barrée (sous-tâches d'un panneau).
   */
  leaveOnDone?: boolean;
  /** État imposé pendant qu'on termine une tâche (arbre d'un projet, voir treeCompletion). */
  completion?: RowCompletion;
  /** Si fourni : « Ajouter une sous-tâche » au survol. */
  onAddSubtask?: () => void;
  /** Si fourni : « Retirer du programme » au survol (programme du jour). */
  onUnplan?: () => void;
  /** Propriétés de glisser-déposer, fournies par l'arbre des tâches d'un projet. */
  dragProps?: HTMLAttributes<HTMLDivElement>;
  style?: CSSProperties;
};

/** Action discrète d'une ligne, visible au survol (ou au clavier). */
function HoverAction({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      title={label}
      aria-label={label}
      className="grid size-7 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity duration-[120ms] ease-soft group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-active hover:text-ink"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

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
  leaveOnDone = true,
  completion,
  onAddSubtask,
  onUnplan,
  dragProps,
  style,
}: TaskRowProps) {
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const openTask = useTaskSheet((state) => state.openTask);
  const selected = useTaskSelection((state) => state.ids.includes(task.id));
  // Pendant qu'on la termine : 1, cochée ; 2, cochée, et la ligne s'efface.
  const phase = useCompletingTasks((state) => {
    const row = completion ?? rowCompletion(task, state.ids, leaveOnDone);
    return row.leaving ? 2 : row.checked ? 1 : 0;
  });
  const done = task.status === 'done';
  const checking = phase > 0 && !done;
  const leaving = phase === 2;
  const rowRef = useRef<HTMLDivElement>(null);
  // La ligne se replie depuis sa hauteur réelle.
  useLayoutEffect(() => {
    if (leaving) rowRef.current?.style.setProperty('--leave-height', `${rowRef.current.offsetHeight}px`);
  }, [leaving]);
  const label = taskDateLabel(task, today);
  const date = label?.kind === 'scheduled' && task.scheduledDate === shownDay ? null : label;
  const toggle = () => toggleTask(task);

  const onClick = (event: MouseEvent) => {
    const selection = useTaskSelection.getState();
    if (event.ctrlKey || event.metaKey) return selection.toggle(task.id);
    if (event.shiftKey) return selection.selectRange(task.id);
    selection.clear();
    openTask(task.id);
  };

  return (
    <div
      ref={rowRef}
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
        (leaving ? 'task-leave ' : '') +
        (selected ? 'bg-accent-soft' : 'hover:bg-hover')
      }
    >
      <TaskCheckbox status={task.status} checking={checking} onToggle={toggle} />
      <span className="flex min-w-0 items-center gap-2.5">
        {task.priority >= 2 && !done && !checking && (
          <span
            title={task.priority === 3 ? 'Urgente' : 'Haute'}
            className={`size-1.5 shrink-0 rounded-full ${task.priority === 3 ? 'bg-danger' : 'bg-warning'}`}
          />
        )}
        <span
          className={
            'truncate transition-colors duration-300 ease-soft ' +
            (checking ? 'task-strike text-ink-3' : done ? 'text-ink-3 line-through decoration-line-strong' : '')
          }
        >
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
        {onAddSubtask && <HoverAction icon={ListPlus} label="Ajouter une sous-tâche" onClick={onAddSubtask} />}
        {onUnplan && <HoverAction icon={CalendarMinus} label="Retirer du programme" onClick={onUnplan} />}
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
          <span className="tnum" title={`Terminée ${formatCompletedAt(task.completedAt, today)}`}>
            {relativeDateLabel(toISODate(new Date(task.completedAt)), today)}
          </span>
        )}
      </span>
    </div>
  );
});
