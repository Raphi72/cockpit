import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Hauteur disponible sous un élément : de son haut jusqu'au bas de la zone qui défile (`main`), moins
 * `gap`. De quoi dessiner une grille qui remplit la fenêtre sans la dépasser. Remesurée quand la
 * fenêtre ou la page changent de taille ; `null` avant la première mesure.
 */
export function useFillHeight(ref: RefObject<HTMLElement | null>, gap: number): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const scroller = element?.closest('main');
    if (!element || !scroller) return;
    const measure = () => {
      const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setHeight(Math.floor(scroller.clientHeight - top - gap));
    };
    measure();
    // La page elle-même : un titre ou un sous-titre qui change déplace l'élément.
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => observer.disconnect();
  }, [ref, gap]);

  return height;
}
