import type { Transition } from 'motion/react';

/**
 * Animations de l'interface (V2) : douces et courtes. Le mouvement accompagne ce qui change (une page
 * qui arrive, une ligne qui part) ; il ne fait jamais attendre. Durées en secondes, comme le veut Motion.
 */

/** La courbe de `--ease-soft` (tokens.css). */
export const EASE_SOFT = [0.2, 0.8, 0.2, 1] as const;

export type MotionKind = 'page' | 'row' | 'toast' | 'screen' | 'spark';

export const TRANSITIONS: Record<MotionKind, Transition> = {
  /** Une page qui apparaît : un simple fondu, sans déplacement (rien ne bouge sous le pointeur). */
  page: { duration: 0.16, ease: EASE_SOFT },
  /** Une ligne qui entre dans une liste ou la quitte : elle s'ouvre ou se replie, les autres suivent. */
  row: { duration: 0.2, ease: EASE_SOFT },
  /** Un message qui se pose en bas de l'écran : un ressort bref, sans rebond visible. */
  toast: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  /** Un écran entier qui arrive ou part (écran du matin, mode focus) : un fondu plus lent, apaisé. */
  screen: { duration: 0.3, ease: EASE_SOFT },
  /** L'étincelle d'une petite célébration : elle éclot avec un léger rebond, juste après son message. */
  spark: { type: 'spring', stiffness: 420, damping: 14, delay: 0.08 },
};

export const INSTANT: Transition = { duration: 0 };

/**
 * La transition à utiliser. Avec « Réduire les animations » de Windows (Paramètres › Accessibilité ›
 * Effets visuels), tout change d'un coup : aucune animation, pas même un fondu.
 */
export function transitionFor(kind: MotionKind, reduced: boolean | null): Transition {
  return reduced ? INSTANT : TRANSITIONS[kind];
}

/**
 * Au-delà de ce nombre de lignes qui entrent ou sortent d'un coup, ce n'est plus « une ligne qui
 * change » mais une autre liste (autre vue, autre jour, autre filtre) : elle s'affiche sans animation.
 */
export const MAX_ANIMATED_CHANGES = 3;

/** Nombre de lignes entrées ou sorties entre deux rendus d'une liste. */
export function countChanges(previous: readonly string[], next: readonly string[]): number {
  const before = new Set(previous);
  const after = new Set(next);
  let changes = 0;
  for (const key of after) if (!before.has(key)) changes += 1;
  for (const key of before) if (!after.has(key)) changes += 1;
  return changes;
}
