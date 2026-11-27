import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatDateField } from '@/core/dates';
import { DND_ACCESSIBILITY } from '@/ui/data/dnd-accessibility';
import { eventClientY, useDragSensors } from '@/ui/data/drag-sensors';
import { useCreateBlock, useDeleteBlock, useDeleteModule, useMoveTasksToBlock, usePlaceOneOff, usePlaceTask, useUnplaceBlock, useUpdateBlock } from '../hooks';
import { moduleIcon } from '../icons';
import { blockFromModule, blockFromTask, movedBlock } from '../model';
import { accepts, type DayDragData, type DayDropData } from './drag';
import { colorVar } from '@/ui/data/ColorDot';

/** Ne garde que les cibles qui acceptent ce qu'on tient (une tâche ne se pose pas dans une colonne). */
const collision: CollisionDetection = (args) => {
  const type = (args.active.data.current as DayDragData | undefined)?.type;
  const hits = pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter((container) => {
      const kind = (container.data.current as DayDropData | undefined)?.kind;
      return type !== undefined && kind !== undefined && accepts(type, kind);
    }),
  });
  // Une tâche lâchée sur un bloc va dedans, plutôt que de devenir un bloc à elle sur la colonne dessous.
  if (type !== 'task') return hits;
  const kindOf = (hit: (typeof hits)[number]) =>
    (hit.data?.droppableContainer?.data.current as DayDropData | undefined)?.kind;
  const inBlock = hits.filter((hit) => kindOf(hit) === 'block');
  return inBlock.length > 0 ? inBlock : hits;
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
 * La corbeille, en bas de l'écran, seulement pendant qu'on tient un bloc ou un module : y lâcher l'un
 * ou l'autre le supprime (« Annuler » le remet). Toujours montée, pour que le glisser la connaisse dès
 * le début du geste ; cachée et inerte le reste du temps.
 */
function TrashZone({ shown }: { shown: boolean }) {
  const drop = useDroppable({ id: 'trash', data: { kind: 'trash' } satisfies DayDropData });
  return createPortal(
    <div
      ref={drop.setNodeRef}
      aria-hidden={!shown}
      className={
        'fixed bottom-8 left-1/2 z-[60] flex h-14 -translate-x-1/2 items-center gap-2.5 rounded-full border px-6 text-sm shadow-overlay ' +
        'transition-[opacity,translate,scale,background-color,color,border-color] duration-[160ms] ease-soft ' +
        (shown ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0') +
        ' ' +
        (drop.isOver ? 'scale-110 border-danger bg-danger text-white' : 'border-line-strong bg-elevated text-ink-2')
      }
    >
      <Trash2 className="size-5" strokeWidth={1.75} />
      {drop.isOver ? 'Lâche pour supprimer' : 'Glisse ici pour supprimer'}
    </div>,
    document.body,
  );
}

/**
 * Glisser-déposer de la page Journée : un module de la bibliothèque devient un bloc à l'heure où on
 * le dépose ; un bloc change d'heure (et de jour, en semaine) en gardant sa durée ; une tâche entre dans
 * un bloc, ou en sort en revenant dans « À caser » ; un bloc ou un module lâché dans la corbeille est
 * supprimé. Tout se fait au quart d'heure, avec « Annuler ».
 */
export function DayDnd({ children, today }: { children: ReactNode; today: string }) {
  const createBlock = useCreateBlock();
  const updateBlock = useUpdateBlock();
  const deleteBlock = useDeleteBlock();
  const deleteModule = useDeleteModule();
  const placeOneOff = usePlaceOneOff();
  const unplaceBlock = useUnplaceBlock();
  const moveTasks = useMoveTasksToBlock();
  const placeTask = usePlaceTask();
  const [dragging, setDragging] = useState<DayDragData | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  // Souris : un petit seuil. Téléphone : un appui long (glisser tout de suite fait défiler la journée).
  const sensors = useDragSensors();
  // Où est le pointeur, et où on a saisi l'élément (distance au haut de l'élément).
  const pointerY = useRef(0);
  const grabOffset = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const track = (event: PointerEvent) => {
      pointerY.current = event.clientY;
    };
    // Au doigt, la position vient des événements tactiles.
    const trackTouch = (event: TouchEvent) => {
      const point = event.touches[0];
      if (point) pointerY.current = point.clientY;
    };
    window.addEventListener('pointermove', track);
    window.addEventListener('touchmove', trackTouch, { passive: true });
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('touchmove', trackTouch);
    };
  }, [dragging]);

  const reset = () => {
    setDragging(null);
    setLabel(null);
  };

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const y = eventClientY(activatorEvent) ?? 0;
    pointerY.current = y;
    // Un module de la bibliothèque se pose par le haut du bloc : on le tient près de son haut.
    const grabbed = activatorEvent.target instanceof Element ? activatorEvent.target.closest('[data-block-id]') : null;
    grabOffset.current = grabbed ? y - grabbed.getBoundingClientRect().top : 8;
    setDragging((active.data.current as DayDragData | undefined) ?? null);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const overKind = (event.over?.data.current as DayDropData | undefined)?.kind;
    if (overKind === 'trash') return setLabel('Supprimer');
    if (overKind === 'to-place' && dragging?.type === 'block') return setLabel('À caser');
    const at = minutesOf(event, pointerY.current, grabOffset.current);
    if (!at || !dragging) return setLabel(null);
    const time =
      dragging.type === 'task'
        ? blockFromTask(dragging.task, at.day, at.minutes).startsAt
        : dragging.type === 'module'
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
      } else if (drop?.kind === 'column') {
        // Sur une heure libre : la tâche y devient un bloc à elle.
        const at = minutesOf(event, pointerY.current, grabOffset.current);
        if (at) placeTask.mutate({ task: current.task, input: blockFromTask(current.task, at.day, at.minutes) });
      }
      return;
    }
    if (drop?.kind === 'trash') {
      if (current.type === 'block') deleteBlock.mutate(current.block.id);
      else deleteModule.mutate(current.module.id);
      return;
    }
    if (drop?.kind === 'to-place') {
      if (current.type === 'block') unplaceBlock.mutate(current.block);
      return;
    }
    const at = minutesOf(event, pointerY.current, grabOffset.current);
    if (!at) return;
    if (current.type === 'module') {
      const input = blockFromModule(current.module, at.day, at.minutes);
      if (current.module.oneOff) placeOneOff.mutate({ module: current.module, input });
      else createBlock.mutate(input);
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
      <TrashZone shown={dragging?.type === 'block' || dragging?.type === 'module'} />
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {overlay && (
            <div
              className="flex h-9 w-max max-w-[320px] items-center gap-2 rounded-md border-l-[3px] bg-elevated px-2.5 text-meta shadow-overlay"
              style={{ borderLeftColor: overlay.color ? colorVar(overlay.color) : 'var(--text-3)' }}
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

