import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useEffect, useRef, type ReactNode } from 'react';
import { transitionFor } from './presets';

/**
 * La page qui arrive apparaît en fondu. Rien au démarrage : la première page est là d'emblée.
 * `pageKey` change avec la page (pas avec ses filtres) : changer de mois dans le calendrier ne
 * rejoue rien. Un fondu seul, sans déplacement : les pages qui se mesurent (calendrier) restent justes.
 */
export function PageTransition({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);

  return (
    <m.div key={pageKey} initial={first.current ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={transitionFor('page', reduced)}>
      {children}
    </m.div>
  );
}
