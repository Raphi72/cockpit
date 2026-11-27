import { PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { isMobileApp } from '@/core/platform';

/**
 * Comment un glisser commence. À la souris, un petit seuil : un clic reste un clic. Au doigt (téléphone),
 * un appui long : glisser tout de suite fait défiler la page ; une fois le glisser lancé, la page ne défile
 * plus sous le doigt (le capteur tactile l'en empêche, ce que les événements de pointeur ne peuvent pas).
 */
export function useDragSensors() {
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } });
  return useSensors(isMobileApp() ? touch : pointer);
}

/** Hauteur du pointeur ou du doigt pour l'événement qui a lancé un glisser (souris, stylet ou toucher). */
export function eventClientY(event: Event | null): number | null {
  if (!event) return null;
  if ('clientY' in event && typeof event.clientY === 'number') return event.clientY;
  if ('touches' in event) {
    const touches = event as TouchEvent;
    const point = touches.touches[0] ?? touches.changedTouches[0];
    return point ? point.clientY : null;
  }
  return null;
}
