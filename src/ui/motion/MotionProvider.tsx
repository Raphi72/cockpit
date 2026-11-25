import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/** Chargé après le premier rendu : jusque-là, les composants animés s'affichent simplement, sans bouger. */
const loadFeatures = () => import('./features').then((module) => module.default);

/**
 * Animations de toute l'app (Motion). Le moteur est chargé à part pour garder un démarrage rapide ;
 * `strict` interdit le composant `motion` complet, qui l'embarquerait d'office. Les déplacements
 * suivent le réglage « Réduire les animations » de Windows (voir aussi `transitionFor`).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
