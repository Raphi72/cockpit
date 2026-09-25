import { describe, expect, it } from 'vitest';
import { parseDateInput } from '@/core/date-input';
import { formatCompletedAt, formatDateField } from '@/core/dates';

const TODAY = '2026-09-25'; // un vendredi

describe('date tapée au clavier', () => {
  it('mots du quotidien', () => {
    expect(parseDateInput('auj.', TODAY)).toBe('2026-09-25');
    expect(parseDateInput('Aujourd’hui', TODAY)).toBe('2026-09-25');
    expect(parseDateInput('demain', TODAY)).toBe('2026-09-26');
    expect(parseDateInput('après-demain', TODAY)).toBe('2026-09-27');
    expect(parseDateInput('hier', TODAY)).toBe('2026-09-24');
  });

  it('décalages : jours, semaines, mois', () => {
    expect(parseDateInput('+3j', TODAY)).toBe('2026-09-28');
    expect(parseDateInput('+3', TODAY)).toBe('2026-09-28');
    expect(parseDateInput('+ 10 jours', TODAY)).toBe('2026-10-05');
    expect(parseDateInput('dans 5 jours', TODAY)).toBe('2026-09-30');
    expect(parseDateInput('2 sem', TODAY)).toBe('2026-10-09');
    expect(parseDateInput('+1m', TODAY)).toBe('2026-10-25');
    expect(parseDateInput('-2j', TODAY)).toBe('2026-09-23');
  });

  it('jours de la semaine : toujours à venir', () => {
    expect(parseDateInput('lundi', TODAY)).toBe('2026-09-28');
    expect(parseDateInput('lun', TODAY)).toBe('2026-09-28');
    expect(parseDateInput('Lundi prochain', TODAY)).toBe('2026-09-28');
    expect(parseDateInput('vendredi', TODAY)).toBe('2026-10-02'); // pas aujourd'hui
    expect(parseDateInput('dim.', TODAY)).toBe('2026-09-27');
  });

  it('dates en chiffres', () => {
    expect(parseDateInput('25/10', TODAY)).toBe('2026-10-25');
    expect(parseDateInput('25/10/2027', TODAY)).toBe('2027-10-25');
    expect(parseDateInput('3.11.26', TODAY)).toBe('2026-11-03');
    expect(parseDateInput('2026-12-01', TODAY)).toBe('2026-12-01');
  });

  it('sans année ni mois : la date la plus proche d’aujourd’hui', () => {
    expect(parseDateInput('3', TODAY)).toBe('2026-10-03');
    expect(parseDateInput('20', TODAY)).toBe('2026-09-20');
    expect(parseDateInput('15/01', TODAY)).toBe('2027-01-15');
    expect(parseDateInput('10/06', TODAY)).toBe('2026-06-10');
  });

  it('dates en lettres', () => {
    expect(parseDateInput('25 oct.', TODAY)).toBe('2026-10-25');
    expect(parseDateInput('1er novembre', TODAY)).toBe('2026-11-01');
    expect(parseDateInput('12 mars 2028', TODAY)).toBe('2028-03-12');
    expect(parseDateInput('3 fév', TODAY)).toBe('2027-02-03');
    expect(parseDateInput('14 août', TODAY)).toBe('2026-08-14');
  });

  it('vide : pas de date ; incompris ou impossible : undefined', () => {
    expect(parseDateInput('   ', TODAY)).toBeNull();
    expect(parseDateInput('bientôt', TODAY)).toBeUndefined();
    expect(parseDateInput('31/02', TODAY)).toBeUndefined();
    expect(parseDateInput('32', TODAY)).toBeUndefined();
    expect(parseDateInput('12 truc', TODAY)).toBeUndefined();
    expect(parseDateInput('2026-02-30', TODAY)).toBeUndefined();
  });
});

describe('affichage des dates', () => {
  it('champ date : jour de la semaine, avec l’année si elle diffère', () => {
    expect(formatDateField('2026-09-25', TODAY)).toBe('ven. 25 sept.');
    expect(formatDateField('2027-01-04', TODAY)).toBe('lun. 4 janv. 2027');
  });

  it('moment où une tâche a été terminée, en heure locale', () => {
    const at = (day: number, month: number, hours: number, minutes: number) =>
      new Date(2026, month - 1, day, hours, minutes).toISOString();
    expect(formatCompletedAt(at(25, 9, 14, 32), TODAY)).toBe('aujourd’hui à 14:32');
    expect(formatCompletedAt(at(24, 9, 9, 5), TODAY)).toBe('hier à 09:05');
    expect(formatCompletedAt(at(12, 9, 18, 0), TODAY)).toBe('le 12 sept. à 18:00');
  });
});
