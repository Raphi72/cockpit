import { describe, expect, it } from 'vitest';
import { deadlineStatus, deadlineThresholds, relativeDayText } from '@/core/deadline';
import { resolveDeadlineDays } from '@/domains/settings/model';

const TODAY = '2026-09-25'; // un vendredi

describe('deadline : texte calculé, le même partout', () => {
  it('suit l’échelle d’urgence', () => {
    const status = (deadline: string) => deadlineStatus(deadline, TODAY);
    expect(status('2026-09-22')).toEqual({ text: 'En retard de 3 jours', tone: 'late' });
    expect(status('2026-09-24')).toEqual({ text: 'En retard de 1 jour', tone: 'late' });
    expect(status(TODAY)).toEqual({ text: 'Aujourd’hui', tone: 'today' });
    expect(status('2026-09-26')).toEqual({ text: 'Demain', tone: 'soon' });
    expect(status('2026-09-28')).toEqual({ text: 'Dans 3 jours', tone: 'soon' });
    expect(status('2026-10-01')).toEqual({ text: 'Dans 6 jours', tone: 'week' });
    expect(status('2026-10-02')).toEqual({ text: 'Dans 7 jours', tone: 'week' });
    expect(status('2026-10-12')).toEqual({ text: '12 octobre', tone: 'later' });
    expect(status('2027-01-04')).toEqual({ text: '4 janvier 2027', tone: 'later' });
  });

  it('dit « Terminée » quand c’est fait, quelle que soit la date', () => {
    expect(deadlineStatus('2026-09-20', TODAY, { done: true })).toEqual({ text: 'Terminée', tone: 'done' });
  });

  it('a une version courte pour les colonnes étroites', () => {
    expect(deadlineStatus('2026-09-22', TODAY, { short: true }).text).toBe('3 j de retard');
    expect(deadlineStatus('2026-10-01', TODAY, { short: true }).text).toBe('Dans 6 j');
    expect(deadlineStatus('2026-10-12', TODAY, { short: true }).text).toBe('12 oct.');
  });

  it('écrit un jour relatif, passé ou à venir', () => {
    expect(relativeDayText('2026-09-24', TODAY)).toBe('Hier');
    expect(relativeDayText('2026-09-21', TODAY)).toBe('Il y a 4 jours');
    expect(relativeDayText('2026-09-10', TODAY)).toBe('10 septembre');
  });
});

describe('deadline : couleurs recalées sur l’horizon du bloc Deadlines', () => {
  it('garde les seuils habituels pour 7 jours', () => {
    expect(deadlineThresholds(7)).toEqual({ red: 0, amber: 3 });
  });

  it('répartit rouge, ambre et bleu dans les mêmes proportions', () => {
    expect(deadlineThresholds(3)).toEqual({ red: 0, amber: 1 });
    expect(deadlineThresholds(5)).toEqual({ red: 0, amber: 2 });
    expect(deadlineThresholds(10)).toEqual({ red: 0, amber: 4 });
    expect(deadlineThresholds(14)).toEqual({ red: 1, amber: 6 });
    expect(deadlineThresholds(30)).toEqual({ red: 3, amber: 13 });
  });

  it('tire vers le rouge à mesure que la deadline approche', () => {
    const tone = (deadline: string) => deadlineStatus(deadline, TODAY, { horizon: 14 }).tone;
    expect(tone('2026-10-09')).toBe('week'); // J+14
    expect(tone('2026-10-02')).toBe('week'); // J+7
    expect(tone('2026-10-01')).toBe('soon'); // J+6
    expect(tone('2026-09-26')).toBe('today'); // demain
    expect(tone('2026-10-10')).toBe('later');
  });

  it('compte les jours jusqu’à l’horizon', () => {
    expect(deadlineStatus('2026-10-07', TODAY, { horizon: 14 }).text).toBe('Dans 12 jours');
    expect(deadlineStatus('2026-10-07', TODAY).text).toBe('7 octobre');
    expect(deadlineStatus('2026-10-07', TODAY, { horizon: 14, short: true }).text).toBe('Dans 12 j');
  });

  it('n’accepte que les durées proposées dans Paramètres', () => {
    expect(resolveDeadlineDays(14)).toBe(14);
    expect(resolveDeadlineDays(8)).toBe(7);
    expect(resolveDeadlineDays('14')).toBe(7);
    expect(resolveDeadlineDays(undefined)).toBe(7);
  });
});
