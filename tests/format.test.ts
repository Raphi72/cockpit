import { describe, expect, it } from 'vitest';
import { formatLongDate, toISODate } from '@/core/dates';
import { formatMoney, formatSignedMoney } from '@/core/money';
import { parseBackupStamp } from '@/domains/data/model';

// Intl sépare les milliers par une espace fine insécable ; on normalise pour lire les attentes.
const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('masque les centimes nuls', () => {
    expect(plain(formatMoney(150000))).toBe('1 500 €');
  });

  it('affiche les centimes quand ils existent', () => {
    expect(plain(formatMoney(428050))).toBe('4 280,50 €');
  });

  it('utilise le vrai signe moins', () => {
    expect(plain(formatMoney(-3500))).toBe('−35 €');
  });

  it('rend le signe explicite pour les mouvements', () => {
    expect(plain(formatSignedMoney(200000))).toBe('+2 000 €');
    expect(plain(formatSignedMoney(-3500))).toBe('−35 €');
  });
});

describe('dates', () => {
  it('formate la date du jour pour le titre du dashboard', () => {
    expect(formatLongDate(new Date(2026, 8, 24))).toBe('Jeudi 24 septembre');
  });

  it('produit le format stocké en base', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('lit l’horodatage des fichiers de sauvegarde', () => {
    expect(parseBackupStamp('2026-09-24_101502')).toEqual(new Date(2026, 8, 24, 10, 15, 2));
    expect(parseBackupStamp('nimporte-quoi')).toBeNull();
  });
});
