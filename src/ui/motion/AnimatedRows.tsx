import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useRef, type ReactNode } from 'react';
import { MAX_ANIMATED_CHANGES, countChanges, transitionFor } from './presets';

type AnimatedRowsProps<T> = {
  items: readonly T[];
  getKey: (item: T) => string;
  children: (item: T, index: number) => ReactNode;
};

/**
 * Lignes d'une liste qui s'ouvrent en arrivant et se replient en partant : celles d'en dessous
 * suivent, au lieu de sauter. Rien au premier affichage, ni quand toute la liste change d'un coup
 * (autre vue, autre jour) : seules une ou deux lignes qui bougent sont animées.
 */
export function AnimatedRows<T>({ items, getKey, children }: AnimatedRowsProps<T>) {
  const reduced = useReducedMotion();
  const keys = items.map(getKey);
  // Une autre liste : on repart d'un affichage neuf, sans rien animer.
  const previous = useRef(keys);
  const generation = useRef(0);
  if (countChanges(previous.current, keys) > MAX_ANIMATED_CHANGES) generation.current += 1;
  previous.current = keys;
  const transition = transitionFor('row', reduced);

  return (
    <AnimatePresence key={generation.current} initial={false}>
      {items.map((item, index) => (
        <m.div
          key={keys[index]}
          // Coupé en hauteur seulement, avec 4 px de marge : repliée, la ligne ne dépasse pas ; ouverte,
          // son survol (plus large qu'elle) et le contour du focus restent entiers.
          className="[overflow-clip-margin:4px] [overflow-y:clip]"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={transition}
        >
          {children(item, index)}
        </m.div>
      ))}
    </AnimatePresence>
  );
}
