import { describe, expect, it } from 'vitest';
import { revisionDays, revisionSlot } from '@/domains/school/exams/revision-plan';

const TODAY = '2026-11-26';

describe('révisions à rebours', () => {
  it('garde les jours encore à venir', () => {
    expect(revisionDays('2026-12-03', TODAY).map((d) => [d.offset, d.day])).toEqual([
      [7, '2026-11-26'],
      [3, '2026-11-30'],
      [1, '2026-12-02'],
    ]);
    expect(revisionDays('2026-11-28', TODAY).map((d) => d.offset)).toEqual([1]);
  });

  it('prend le premier créneau libre du soir, sinon 18 h', () => {
    expect(revisionSlot([])).toEqual({ start: 17 * 60, end: 18 * 60, taken: false });
    expect(revisionSlot([{ start: 17 * 60, end: 19 * 60 + 10 }])).toEqual({ start: 19 * 60 + 15, end: 20 * 60 + 15, taken: false });
    expect(revisionSlot([{ start: 16 * 60, end: 23 * 60 }])).toEqual({ start: 18 * 60, end: 19 * 60, taken: true });
    // Aujourd'hui, pas avant l'heure qu'il est.
    expect(revisionSlot([], 20 * 60 + 5)).toEqual({ start: 20 * 60 + 15, end: 21 * 60 + 15, taken: false });
  });
});
