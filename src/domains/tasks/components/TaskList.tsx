import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Fragment, useState } from 'react';
import { useReorderTasks } from '../hooks';
import { computeReorder, nestTasks, type TaskItem, type TaskNode } from '../model';
import { InlineAddTask } from './InlineAddTask';
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

function SortableTaskRow(props: { task: TaskItem; today: string; depth: 0 | 1; onAddSubtask?: () => void }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <TaskRow
      task={props.task}
      today={props.today}
      depth={props.depth}
      showParent={false}
      showProject={false}
      onAddSubtask={props.onAddSubtask}
      dragRef={setNodeRef}
      dragProps={listeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
    />
  );
}

const ROOT = '';

/**
 * Tâches d'un projet en arbre : chaque tâche suivie de ses sous-tâches, en retrait.
 * Glisser-déposer à chaque niveau (une tâche parmi les tâches, une sous-tâche parmi ses sœurs).
 * Au survol d'une tâche, « Ajouter une sous-tâche » ouvre la saisie sous elle.
 */
export function SortableTaskTree({ nodes, today, listKey }: { nodes: TaskNode[]; today: string; listKey: readonly unknown[] }) {
  const reorder = useReorderTasks(listKey);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  // Souris uniquement, avec un petit seuil : un clic reste un clic. Au clavier,
  // Entrée ouvre la tâche et Espace la coche (pas de glisser-déposer).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const containers = new Map<string, TaskItem[]>([
    [ROOT, nodes.map((node) => node.task)],
    ...nodes.map((node) => [node.task.id, node.children] as [string, TaskItem[]]),
  ]);
  const containerOf = (id: string) => [...containers.entries()].find(([, list]) => list.some((t) => t.id === id));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = containerOf(String(active.id));
    const to = containerOf(String(over.id));
    // On ne change pas de niveau en glissant : une sous-tâche reste avec ses sœurs.
    if (!from || !to || from[0] !== to[0]) return;
    const list = from[1];
    const updates = computeReorder(
      list,
      list.findIndex((t) => t.id === active.id),
      list.findIndex((t) => t.id === over.id),
    );
    if (updates.length > 0) reorder.mutate(updates);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={nodes.map((node) => node.task.id)} strategy={verticalListSortingStrategy}>
        {nodes.map(({ task, children }) => (
          <Fragment key={task.id}>
            <SortableTaskRow task={task} today={today} depth={0} onAddSubtask={() => setAddingTo(task.id)} />
            {children.length > 0 && (
              <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
                {children.map((child) => (
                  <SortableTaskRow key={child.id} task={child} today={today} depth={1} />
                ))}
              </SortableContext>
            )}
            {addingTo === task.id && (
              <InlineAddTask parentId={task.id} projectId={task.projectId} autoEdit indent onClose={() => setAddingTo(null)} />
            )}
          </Fragment>
        ))}
      </SortableContext>
    </DndContext>
  );
}
