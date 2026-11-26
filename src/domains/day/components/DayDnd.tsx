import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatDateField } from '@/core/dates';
import { DND_ACCESSIBILITY } from '@/ui/data/dnd-accessibility';
import { useCreateBlock, useMoveTasksToBlock, useUpdateBlock } from '../hooks';
import { moduleIcon } from '../icons';
import { blockFromModule, movedBlock } from '../model';
import { accepts, type DayDragData, type DayDropData } from './drag';

/** Ne garde que les cibles qui acceptent ce qu'on tient (une tâche ne se pose pas dans une colonne). */
const collision: CollisionDetection = (args) => {
  const type = (args.active.data.current as DayDragData | undefined)?.type;
  return pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const kind = (container.data.current as DayDropData | undefined)?.kind;
      return type !== undefined && kind !== undefined && accepts(type, kind);
    }),
  });
};

/**
 * Heure du haut de ce qu'on tient, dans la colonne survolée (minutes depuis minuit). Tout est lu à
 * l'écran au moment même (position du pointeur, colonne) : la page peut avoir défilé depuis le début
 * du geste (elle défile toute seule près des bords, et s'ouvre sur l'heure qu'il est).
 */
function minutesOf(event: DragMoveEvent | DragEndEvent, pointerY: number, grabOffset: number): { day: string; minutes: number } | null {
  const data = event.over?.data.current as DayDropData | undefined;
  if (!event.over || data?.kind !== 'column') return null;
  const column = document.querySelector<HTMLElement>(`[data-day="${data.day}"]`);
  if (!column) return null;
  const top = pointerY - grabOffset - column.getBoundingClientRect().top;
  return { day: data.day, minutes: data.firstHour * 60 + (top / data.hourHeight) * 60 };
}

/**
 * Glisser-déposer de la page Journée : un module de la bibliothèque devient un bloc à l'heure où on
 * le dépose ; un bloc change d'heure (et de jour, en semaine) en gardant sa durée ; une tâche entre dans
 * un bloc, ou en sort en revenant dans « À caser ». Tout se fait au quart d'heure, avec « Annuler ».
 */
export function DayDnd({ children, today }: { children: ReactNode; today: string }) {
  const createBlock = useCreateBlock();
  const updateBlock = useUpdateBlock();
  const moveTasks = useMoveTasksToBlock();
  const [dragging, setDragging] = useState<DayDragData | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // Où est le pointeur, et où on a saisi l'élément (distance au haut de l'élément).
  const pointerY = useRef(0);
  const grabOffset = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const track = (event: PointerEvent) => {
      pointerY.current = event.clientY;
    };
    window.addEventListener('pointermove', track);
    return () => window.removeEventListener('pointermove', track);
  }, [dragging]);

  const reset = () => {
    setDragging(null);
    setLabel(null);
  };

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const y = activatorEvent instanceof PointerEvent ? activatorEvent.clientY : 0;
    pointerY.current = y;
    // Un module de la bibliothèque se pose par le haut du bloc : on le tient près de son haut.
    const grabbed = activatorEvent.target instanceof Element ? activatorEvent.target.closest('[data-block-id]') : null;
    grabOffset.current = grabbed ? y - grabbed.getBoundingClientRect().top : 8;
    setDragging((active.data.current as DayDragData | undefined) ?? null);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const at = minutesOf(event, pointerY.current, grabOffset.current);
    if (!at || !dragging || dragging.type === 'task') return setLabel(null);
    const time =
      dragging.type === 'module'
        ? blockFromModule(dragging.module, at.day, at.minutes).startsAt
        : movedBlock(dragging.block, at.day, at.minutes).startsAt;
    const next = at.day === today ? time : `${formatDateField(at.day, today)} · ${time}`;
    if (next !== label) setLabel(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const current = dragging;
    reset();
    if (!current || !event.over) return;
    const drop = event.over.data.current as DayDropData | undefined;
    if (current.type === 'task') {
      if (drop?.kind === 'block' && current.task.blockId !== drop.block.id) {
        moveTasks.mutate({ taskIds: [current.task.id], blockId: drop.block.id, message: `Dans « ${drop.block.title} ».` });
      } else if (drop?.kind === 'to-place' && current.task.blockId !== null) {
        moveTasks.mutate({ taskIds: [current.task.id], blockId: null, message: 'Sortie du bloc.' });
      }
      return;
    }
    const at = minutesOf(event, pointerY.current, grabOffset.current);
    if (!at) return;
    if (current.type === 'module') {
      createBlock.mutate(blockFromModule(current.module, at.day, at.minutes));
      return;
    }
    const moved = movedBlock(current.block, at.day, at.minutes);
    if (moved.date === current.block.date && moved.startsAt === current.block.startsAt) return;
    const when = moved.date === current.block.date ? moved.startsAt : `${formatDateField(moved.date, today).toLowerCase()} à ${moved.startsAt}`;
    updateBlock.mutate({ block: current.block, patch: moved, undoable: `« ${current.block.title} » déplacé : ${when}.` });
  };

  const overlay = (() => {
    if (!dragging) return null;
    if (dragging.type === 'task') return { title: dragging.task.title, color: dragging.task.projectColor ?? dragging.task.subjectColor, icon: null };
    if (dragging.type === 'module') return { title: dragging.module.name, color: dragging.module.color, icon: dragging.module.icon };
    return { title: dragging.block.title, color: dragging.block.color, icon: dragging.block.icon };
  })();
  const OverlayIcon = overlay?.icon ? moduleIcon(overlay.icon) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={DND_ACCESSIBILITY}
      autoScroll={{ threshold: { x: 0, y: 0.1 } }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      {children}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {overlay && (
            <div
              className="flex h-9 w-max max-w-[320px] items-center gap-2 rounded-md border-l-[3px] bg-elevated px-2.5 text-meta shadow-overlay"
              style={{ borderLeftColor: overlay.color ? `var(--p-${overlay.color})` : 'var(--text-3)' }}
            >
              {OverlayIcon && <OverlayIcon className="size-3.5 shrink-0" strokeWidth={2} />}
              <span className="truncate font-medium">{overlay.title}</span>
              {label && <span className="tnum ml-auto shrink-0 pl-2 text-accent">{label}</span>}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

