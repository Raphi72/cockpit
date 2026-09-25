import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Fragment, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMoveTask } from '../hooks';
import { keyboardDrop, placeInTree, type TaskItem, type TaskNode, type TreeKey } from '../model';
import { TASK_ROW_ATTRIBUTE } from '../selection-store';
import { TASKS_END_ZONE, taskDragId, usePlanDrag, useTreeHint } from '../tree-dnd';
import { InlineAddTask } from './InlineAddTask';
import { TaskRow } from './TaskRow';

const TREE_KEYS: Record<string, TreeKey> = { ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'indent', ArrowLeft: 'outdent' };

/** Après un déplacement au clavier, le focus reste sur la tâche (la ligne a pu être recréée). */
function refocus(taskId: string) {
  const focus = () =>
    document.querySelector<HTMLElement>(`[data-row][${TASK_ROW_ATTRIBUTE}="${taskId}"]`)?.focus({ preventScroll: false });
  requestAnimationFrame(() => requestAnimationFrame(focus));
}

/** Repère de dépôt : un trait avant ou après la ligne, ou la ligne encadrée (elle deviendrait une sous-tâche). */
function DropHint({ position, depth }: { position: 'before' | 'after' | 'inside'; depth: 0 | 1 }) {
  if (position === 'inside') {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-x-2.5 inset-y-0 z-10 rounded-md bg-accent-soft ring-2 ring-accent"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={
        'pointer-events-none absolute right-[-10px] z-10 h-0.5 rounded-full bg-accent ' +
        (depth === 1 ? 'left-[28px] ' : 'left-[-10px] ') +
        (position === 'before' ? '-top-px' : '-bottom-px')
      }
    />
  );
}

function TreeRow(props: {
  task: TaskItem;
  depth: 0 | 1;
  today: string;
  onAddSubtask?: () => void;
  onTreeKey: (task: TaskItem, key: TreeKey) => void;
}) {
  const { task, depth } = props;
  const drag = useDraggable({ id: taskDragId(task.id), data: { type: 'task', task } });
  const drop = useDroppable({ id: taskDragId(task.id), data: { task } });
  const hint = useTreeHint(task.id);

  // Alt + flèches : changer de place, ranger dans la tâche du dessus, sortir de sa parente.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = TREE_KEYS[event.key];
    if (!event.altKey || event.ctrlKey || event.shiftKey || !key || !(event.target as HTMLElement).hasAttribute('data-row')) return;
    event.preventDefault();
    props.onTreeKey(task, key);
  };

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      onKeyDown={onKeyDown}
      className="relative"
    >
      <TaskRow
        task={task}
        today={props.today}
        depth={depth}
        showParent={false}
        showProject={false}
        onAddSubtask={props.onAddSubtask}
        dragProps={drag.listeners}
        style={drag.isDragging ? { opacity: 0.35 } : undefined}
      />
      {hint && <DropHint position={hint} depth={depth} />}
    </div>
  );
}

/**
 * Fin de la liste des tâches (l'ajout express) : on peut y déposer une tâche ou une idée pour la
 * mettre en dernier, même quand la liste est vide.
 */
export function TreeEndZone({ children }: { children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: TASKS_END_ZONE });
  const { target } = usePlanDrag();
  const active = target?.kind === 'tree' && target.drop.position === 'end';
  return (
    <div ref={setNodeRef} className="relative">
      {active && <span aria-hidden className="pointer-events-none absolute -top-px right-[-10px] left-[-10px] z-10 h-0.5 rounded-full bg-accent" />}
      {children}
    </div>
  );
}

/**
 * Tâches d'un projet en arbre : chaque tâche suivie de ses sous-tâches, en retrait. Le glisser-déposer
 * est géré par la fiche projet (ProjectPlan) : une tâche se range avant, après ou dans une autre, ou
 * part dans les idées. Au clavier, Alt + ↑ ↓ change de place, Alt + → range la tâche dans celle du
 * dessus, Alt + ← la sort de sa parente. Au survol, « Ajouter une sous-tâche » ouvre la saisie sous elle.
 */
export function TaskTree({ nodes, today, projectId }: { nodes: TaskNode[]; today: string; projectId: string }) {
  const move = useMoveTask(projectId);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const onTreeKey = (task: TaskItem, key: TreeKey) => {
    const drop = keyboardDrop(nodes, task.id, key);
    const placement = drop && placeInTree(nodes, { id: task.id, hasSubtasks: task.subtasksTotal > 0 }, drop);
    if (!placement) return;
    move.mutate({ task, placement });
    refocus(task.id);
  };

  return (
    <>
      {nodes.map(({ task, children }) => (
        <Fragment key={task.id}>
          <TreeRow task={task} depth={0} today={today} onAddSubtask={() => setAddingTo(task.id)} onTreeKey={onTreeKey} />
          {children.map((child) => (
            <TreeRow key={child.id} task={child} depth={1} today={today} onTreeKey={onTreeKey} />
          ))}
          {addingTo === task.id && (
            <InlineAddTask parentId={task.id} projectId={task.projectId} autoEdit indent onClose={() => setAddingTo(null)} />
          )}
        </Fragment>
      ))}
    </>
  );
}
