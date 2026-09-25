import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReorderTasks } from '../hooks';
import { computeReorder, type TaskItem } from '../model';
import { TaskRow } from './TaskRow';

type TaskListProps = {
  tasks: TaskItem[];
  today: string;
  showProject?: boolean;
  showCompletion?: boolean;
  /** Jour que montre la liste : une date prévue ce jour-là n'est pas répétée. */
  shownDay?: string;
  /** Clé de cache de la liste : si fournie, les tâches se réordonnent par glisser-déposer. */
  sortableKey?: readonly unknown[];
};

function SortableTaskRow({ task, today, showProject }: { task: TaskItem; today: string; showProject: boolean }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <TaskRow
      task={task}
      today={today}
      showProject={showProject}
      dragRef={setNodeRef}
      dragProps={listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
    />
  );
}

function SortableTaskList({
  tasks,
  today,
  showProject,
  sortableKey,
}: Required<Omit<TaskListProps, 'showCompletion' | 'shownDay'>>) {
  const reorder = useReorderTasks(sortableKey);
  // Souris uniquement, avec un petit seuil : un clic reste un clic. Au clavier,
  // Entrée ouvre la tâche et Espace la coche (pas de glisser-déposer).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = tasks.findIndex((t) => t.id === active.id);
    const to = tasks.findIndex((t) => t.id === over.id);
    const updates = computeReorder(tasks, from, to);
    if (updates.length > 0) reorder.mutate(updates);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableTaskRow key={task.id} task={task} today={today} showProject={showProject} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

export function TaskList({ tasks, today, showProject = true, showCompletion = false, shownDay, sortableKey }: TaskListProps) {
  if (sortableKey) {
    return <SortableTaskList tasks={tasks} today={today} showProject={showProject} sortableKey={sortableKey} />;
  }
  return (
    <>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={today}
          showProject={showProject}
          showCompletion={showCompletion}
          shownDay={shownDay}
        />
      ))}
    </>
  );
}
