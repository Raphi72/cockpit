import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { useDeadlineHorizon } from '@/core/deadline-horizon';
import { DEADLINE_TONE_CLASS } from '@/ui/data/deadline-tone';
import { DND_ACCESSIBILITY } from '@/ui/data/dnd-accessibility';
import { handleRowKeyDown } from '@/ui/data/row-keys';
import { useCompletingTasks } from '../completion-store';
import { useCompleteTask, useDeleteTask, useToggleTask, useUpdateTask } from '../hooks';
import { TASK_STATUSES, TASK_STATUS_LABELS, rowCompletion, taskDateLabel, type TaskItem, type TaskStatus } from '../model';
import { useTaskSheet } from '../sheet-store';
import { TaskCheckbox } from './TaskCheckbox';

function Card({
  task,
  today,
  overlay = false,
  checking = false,
}: {
  task: TaskItem;
  today: string;
  overlay?: boolean;
  /** La tâche est en train d'être terminée : la case se remplit, le titre se barre. */
  checking?: boolean;
}) {
  const toggle = useToggleTask();
  const date = taskDateLabel(task, today, useDeadlineHorizon());
  const done = task.status === 'done';
  return (
    <div
      className={
        'rounded-lg border border-line bg-elevated px-3 py-2.5 ' +
        (overlay ? 'rotate-1 shadow-overlay' : 'hover:border-line-strong')
      }
    >
      <div className="flex items-start gap-2.5">
        <span className="pt-0.5">
          <TaskCheckbox status={task.status} checking={checking} onToggle={() => toggle(task)} />
        </span>
        <span
          className={
            'min-w-0 flex-1 transition-colors duration-300 ease-soft ' +
            (checking ? 'text-ink-3' : done ? 'text-ink-3 line-through decoration-line-strong' : '')
          }
        >
          <span className={checking ? 'task-strike' : ''}>
            {task.parentTitle && <span className="text-ink-3">{task.parentTitle} › </span>}
            {task.title}
          </span>
        </span>
      </div>
      {(date || task.priority >= 2) && !done && (
        <div className="mt-1.5 flex items-center gap-3 pl-7 text-meta">
          {task.priority >= 2 && <span className={task.priority === 3 ? 'text-danger' : 'text-warning'}>{task.priority === 3 ? 'Urgente' : 'Haute'}</span>}
          {date && <span className={`tnum ${DEADLINE_TONE_CLASS[date.tone]}`}>{date.label}</span>}
        </div>
      )}
    </div>
  );
}

function DraggableCard({ task, today }: { task: TaskItem; today: string }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: task.id });
  const openTask = useTaskSheet((state) => state.openTask);
  const deleteTask = useDeleteTask();
  // Cochée, la carte s'efface de sa colonne puis passe dans « Terminé ».
  const checking = useCompletingTasks((state) => rowCompletion(task, state.ids).checked) && task.status !== 'done';
  const cardRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (checking) cardRef.current?.style.setProperty('--leave-height', `${cardRef.current.offsetHeight}px`);
  }, [checking]);
  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        cardRef.current = node;
      }}
      {...listeners}
      role="button"
      tabIndex={0}
      data-row
      onClick={() => openTask(task.id)}
      onKeyDown={(event) => handleRowKeyDown(event, { open: () => openTask(task.id), remove: () => deleteTask.mutate(task) })}
      className={`cursor-default rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-soft ${isDragging ? 'opacity-30' : ''} ${checking ? 'task-leave' : ''}`}
    >
      <Card task={task} today={today} checking={checking} />
    </div>
  );
}

function Column({ status, tasks, today }: { status: TaskStatus; tasks: TaskItem[]; today: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={`min-h-40 rounded-xl p-2 transition-colors duration-[120ms] ease-soft ${isOver ? 'bg-active' : 'bg-hover/60'}`}
    >
      <h3 className="flex items-center gap-2 px-1.5 pt-1 pb-2.5 text-meta font-medium text-ink-2">
        {TASK_STATUS_LABELS[status]}
        <span className="tnum text-ink-3">{tasks.length}</span>
      </h3>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} today={today} />
        ))}
      </div>
    </section>
  );
}

/** Kanban : glisser une carte dans une autre colonne change son statut. */
export function TaskBoard({ tasks, today }: { tasks: TaskItem[]; today: string }) {
  const update = useUpdateTask();
  const complete = useCompleteTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const active = tasks.find((t) => t.id === activeId);

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null);
    const status = over?.id as TaskStatus | undefined;
    const task = tasks.find((t) => t.id === dragged.id);
    if (!task || !status || task.status === status) return;
    // Déposée dans « Terminé » : terminée tout de suite, avec le même toast que la case.
    if (status === 'done') complete(task, 0);
    else update.mutate({ id: task.id, patch: { status } });
  };

  return (
    <DndContext
      sensors={sensors}
      accessibility={DND_ACCESSIBILITY}
      onDragStart={({ active: started }: DragStartEvent) => setActiveId(String(started.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-3 gap-3">
        {TASK_STATUSES.map((status) => (
          <Column key={status} status={status} tasks={tasks.filter((t) => t.status === status)} today={today} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <Card task={active} today={today} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
