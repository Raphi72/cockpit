import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Circle, Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { useIdeaToTask, useTaskToIdea } from '@/domains/ideas/hooks';
import { ProjectIdeas } from '@/domains/ideas/components/ProjectIdeas';
import { canBecomeIdea } from '@/domains/ideas/service';
import type { Idea } from '@/domains/ideas/model';
import { ProjectTasks } from '@/domains/tasks/components/ProjectTasks';
import { useMoveTask, useProjectTasks } from '@/domains/tasks/hooks';
import { placeInTree, projectTaskTree, type TaskNode } from '@/domains/tasks/model';
import {
  IDEAS_ZONE,
  PlanDragContext,
  TASKS_END_ZONE,
  dropOnRow,
  movedOf,
  type PlanDragItem,
  type PlanTarget,
} from '@/domains/tasks/tree-dnd';
import { DND_ACCESSIBILITY } from '@/ui/data/dnd-accessibility';
import { toast } from '@/ui/overlays/toast';

/** Où irait l'élément si on le lâchait maintenant (voir dropOnRow pour une ligne de tâche). */
function targetOf(event: DragMoveEvent, nodes: TaskNode[]): PlanTarget | null {
  const { active, over, activatorEvent, delta } = event;
  const item = active.data.current as PlanDragItem | undefined;
  if (!over || !item) return null;
  if (over.id === IDEAS_ZONE) return item.type === 'task' ? { kind: 'ideas' } : null;
  if (over.id === TASKS_END_ZONE) {
    const drop = { position: 'end' } as const;
    return placeInTree(nodes, movedOf(item), drop) ? { kind: 'tree', drop } : null;
  }
  const targetId = (over.data.current as { task?: { id: string } } | undefined)?.task?.id;
  if (!targetId || !(activatorEvent instanceof PointerEvent)) return null;
  const ratio = (activatorEvent.clientY + delta.y - over.rect.top) / over.rect.height;
  const drop = dropOnRow(nodes, item, targetId, ratio);
  return drop ? { kind: 'tree', drop } : null;
}

/** Ce que ferait le dépôt, sous l'élément qu'on fait glisser. */
function targetLabel(item: PlanDragItem, target: PlanTarget | null, nodes: TaskNode[]): string | null {
  if (!target) return null;
  if (target.kind === 'ideas') return 'En faire une idée';
  if (target.drop.position === 'inside') {
    const targetId = target.drop.targetId;
    const parent = nodes.find((node) => node.task.id === targetId)?.task.title;
    return parent ? `Sous-tâche de « ${parent} »` : null;
  }
  return item.type === 'idea' ? 'En faire une tâche' : null;
}

/**
 * Tâches et idées d'un projet, avec un seul glisser-déposer : une tâche se range avant, après ou
 * dans une autre (sous-tâche), ou part dans les idées ; une idée devient une tâche là où on la dépose.
 * Les deux conversions ont « Annuler ». Une tâche qui a des sous-tâches ne devient pas une idée.
 */
export function ProjectPlan({ projectId, today }: { projectId: string; today: string }) {
  const { data: tasks = [] } = useProjectTasks(projectId);
  const nodes = projectTaskTree(tasks).open;
  const move = useMoveTask(projectId);
  const ideaToTask = useIdeaToTask();
  const taskToIdea = useTaskToIdea();
  const [dragging, setDragging] = useState<PlanDragItem | null>(null);
  const [target, setTarget] = useState<PlanTarget | null>(null);
  // Souris uniquement, avec un petit seuil : un clic reste un clic. Au clavier : Alt + flèches (TaskTree).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const reset = () => {
    setDragging(null);
    setTarget(null);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const next = targetOf(event, nodes);
    if (JSON.stringify(next) !== JSON.stringify(target)) setTarget(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const item = dragging;
    const final = targetOf(event, nodes);
    reset();
    if (!item || !final) return;
    if (final.kind === 'ideas') {
      if (item.type !== 'task') return;
      if (!canBecomeIdea(item.task)) {
        toast('Une tâche qui a des sous-tâches ne peut pas devenir une idée.', { tone: 'danger' });
        return;
      }
      taskToIdea.mutate(item.task);
      return;
    }
    const placement = placeInTree(nodes, movedOf(item), final.drop);
    if (!placement) return;
    if (item.type === 'task') move.mutate({ task: item.task, placement });
    else ideaToTask.mutate({ idea: item.idea as Idea, placement });
  };

  const label = dragging ? targetLabel(dragging, target, nodes) : null;
  const Icon = dragging?.type === 'idea' ? Lightbulb : Circle;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      accessibility={DND_ACCESSIBILITY}
      onDragStart={({ active }: DragStartEvent) => setDragging((active.data.current as PlanDragItem | undefined) ?? null)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <PlanDragContext.Provider value={{ dragging, target }}>
        <ProjectTasks projectId={projectId} today={today} />
        <div className="mt-14">
          <ProjectIdeas projectId={projectId} />
        </div>
      </PlanDragContext.Provider>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="flex h-10 w-max max-w-[560px] items-center gap-3 rounded-md border border-line bg-elevated px-3 shadow-overlay">
            <Icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
            <span className="truncate">{dragging.type === 'task' ? dragging.task.title : dragging.idea.title}</span>
            {label && <span className="ml-auto shrink-0 pl-3 text-meta text-accent">{label}</span>}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
