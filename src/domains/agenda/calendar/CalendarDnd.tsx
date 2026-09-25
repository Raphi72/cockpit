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
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { daysBetween, formatDateField } from '@/core/dates';
import { DND_ACCESSIBILITY } from '@/ui/data/dnd-accessibility';
import { useMoveAgendaItem } from '../hooks';
import { isRetimed, snapTime, type AgendaItem, type CalendarDrop } from '../model';
import { AgendaMarker } from './AgendaChip';
import type { DropData } from './drag';

/** Jour de la case sous le pointeur (les cases portent `data-day`), même sous une barre. */
function dayAt(x: number, y: number): string | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const day = element instanceof HTMLElement ? element.dataset.day : undefined;
    if (day) return day;
  }
  return null;
}

/** Où l'on déposerait maintenant : le jour, et l'heure du haut du bloc dans une colonne horaire. */
function dropOf(event: DragMoveEvent): CalendarDrop | null {
  const data = event.over?.data.current as DropData | undefined;
  if (!event.over || !data) return null;
  const rect = event.active.rect.current.translated;
  if (!data.grid || !rect) return { day: data.day, time: null };
  const minutes = data.grid.firstHour * 60 + ((rect.top - event.over.rect.top) / data.grid.hourHeight) * 60;
  return { day: data.day, time: snapTime(minutes) };
}

type Dragging = { item: AgendaItem; grabDay: string };

/**
 * Glisser-déposer du calendrier : on prend une tâche, un encaissement, un début ou une deadline de
 * projet, ou un événement, et on le dépose sur un autre jour pour changer sa date. Dans la grille
 * horaire, un événement à heure fixe prend l'heure du créneau (au quart d'heure). L'élément se décale
 * du nombre de jours entre la case où on l'a pris et celle où on le dépose : une barre sur plusieurs
 * jours garde sa durée. Un clic reste un clic (seuil de quelques pixels).
 */
export function CalendarDnd({ children, today }: { children: ReactNode; today: string }) {
  const move = useMoveAgendaItem();
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [drop, setDrop] = useState<CalendarDrop | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const reset = () => {
    setDragging(null);
    setDrop(null);
  };

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const item = (active.data.current as { item?: AgendaItem } | undefined)?.item;
    if (!item) return;
    const pointer = activatorEvent instanceof PointerEvent ? dayAt(activatorEvent.clientX, activatorEvent.clientY) : null;
    setDragging({ item, grabDay: pointer ?? item.start.slice(0, 10) });
  };

  const onDragMove = (event: DragMoveEvent) => {
    const next = dropOf(event);
    if (next?.day !== drop?.day || next?.time !== drop?.time) setDrop(next);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const current = dragging;
    const final = dropOf(event);
    reset();
    if (!current || !final) return;
    move.mutate({ item: current.item, days: daysBetween(current.grabDay, final.day), time: final.time, dropDay: final.day });
  };

  const label =
    dragging && drop
      ? formatDateField(drop.day, today) + (isRetimed(dragging.item, drop) ? ` · ${drop.time}` : '')
      : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      accessibility={DND_ACCESSIBILITY}
      // La page ne défile que tout près du bord : les dernières semaines du mois restent des cibles stables.
      autoScroll={{ threshold: { x: 0, y: 0.08 } }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      {children}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragging && (
            // À la taille du contenu (une colonne de la semaine est étroite), la hauteur de l'élément pris.
            <div className="flex h-full min-h-[22px] w-max max-w-[360px] items-start gap-1.5 rounded-sm bg-elevated px-1.5 py-[3px] text-meta whitespace-nowrap shadow-overlay">
              <span className="pt-0.5">
                <AgendaMarker item={dragging.item} today={today} />
              </span>
              <span className="truncate font-medium">{dragging.item.title}</span>
              {label && <span className="tnum ml-auto shrink-0 pl-2 text-accent">{label}</span>}
            </div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
