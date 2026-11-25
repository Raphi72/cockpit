import { describe, expect, it } from 'vitest';
import { INSTANT, MAX_ANIMATED_CHANGES, TRANSITIONS, countChanges, transitionFor } from '@/ui/motion/presets';

describe('animations', () => {
  it('restent courtes : le mouvement ne fait jamais attendre', () => {
    for (const transition of [TRANSITIONS.page, TRANSITIONS.row]) {
      expect(transition.duration).toBeGreaterThan(0);
      expect(transition.duration).toBeLessThanOrEqual(0.2);
    }
  });

  it('disparaissent toutes avec « Réduire les animations » de Windows', () => {
    expect(transitionFor('page', true)).toEqual({ duration: 0 });
    expect(transitionFor('row', true)).toBe(INSTANT);
    expect(transitionFor('toast', true)).toBe(INSTANT);
    // Réglage inconnu (pas encore lu) ou désactivé : les animations normales.
    expect(transitionFor('row', false)).toBe(TRANSITIONS.row);
    expect(transitionFor('row', null)).toBe(TRANSITIONS.row);
  });

  it('comptent les lignes entrées et sorties d’une liste', () => {
    expect(countChanges(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    // Réordonner ne change rien à ce compte.
    expect(countChanges(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(0);
    expect(countChanges(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    expect(countChanges(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(2);
    expect(countChanges(['a', 'b'], ['c', 'd'])).toBe(4);
    expect(countChanges([], [])).toBe(0);
  });

  it('n’animent pas une liste qui change presque entièrement (autre vue, autre jour)', () => {
    // Une ligne ajoutée, une ligne triée et la suivante qui arrive : animé.
    expect(countChanges(['a', 'b', 'c'], ['a', 'c', 'd'])).toBeLessThanOrEqual(MAX_ANIMATED_CHANGES);
    // La vue « Semaine » remplace la vue « Aujourd'hui » : pas d'accordéon.
    expect(countChanges(['a', 'b', 'c'], ['d', 'e', 'f'])).toBeGreaterThan(MAX_ANIMATED_CHANGES);
  });
});
