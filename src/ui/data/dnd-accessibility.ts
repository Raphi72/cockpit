import type { DndContextProps } from '@dnd-kit/core';

/**
 * Annonces du glisser-déposer pour les lecteurs d'écran, en français (dnd-kit les donne en anglais).
 * À passer à chaque DndContext : `accessibility={DND_ACCESSIBILITY}`.
 */
export const DND_ACCESSIBILITY: DndContextProps['accessibility'] = {
  screenReaderInstructions: {
    draggable: 'Élément à glisser avec la souris, puis à déposer ailleurs.',
  },
  announcements: {
    onDragStart: () => 'Élément pris.',
    onDragOver: ({ over }) => (over ? 'Au-dessus d’un emplacement possible.' : 'Hors des emplacements possibles.'),
    onDragEnd: ({ over }) => (over ? 'Élément déposé.' : 'Élément reposé à sa place.'),
    onDragCancel: () => 'Déplacement annulé.',
  },
};
