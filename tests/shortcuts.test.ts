import { describe, expect, it } from 'vitest';
import { digitFromEvent } from '@/app/shortcuts';

describe('raccourcis Ctrl+1…6', () => {
  it('reconnaît la touche physique, quelle que soit la disposition', () => {
    expect(digitFromEvent({ code: 'Digit1', key: '&' })).toBe('1'); // AZERTY sans Maj
    expect(digitFromEvent({ code: 'Digit6', key: '6' })).toBe('6'); // QWERTY ou AZERTY avec Maj
    expect(digitFromEvent({ code: 'Numpad3', key: '3' })).toBe('3');
  });

  it('se rabat sur le caractère AZERTY quand le code physique manque', () => {
    expect(digitFromEvent({ code: '', key: '-' })).toBe('6');
    expect(digitFromEvent({ code: '', key: 'é' })).toBe('2');
    expect(digitFromEvent({ code: '', key: 'b' })).toBeNull();
  });
});
