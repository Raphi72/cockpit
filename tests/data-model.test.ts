import { describe, expect, it } from 'vitest';
import { humanizeError, UserError } from '@/core/db/errors';
import { describeCandidate, parseBackupStamp, recoveryMessage, type RestoreCandidate } from '@/domains/data/model';

const candidate: RestoreCandidate = {
  fileName: 'cockpit_2026-09-21_090200_auto.db',
  stamp: '2026-09-21_090200',
  modifiedMs: null,
  schemaVersion: 2,
  projects: 12,
  tasks: 48,
  transactions: 1,
};

describe('restauration', () => {
  it('décrit la sauvegarde choisie en une phrase', () => {
    expect(describeCandidate(candidate)).toBe(
      'Sauvegarde du 21 sept. 2026 à 09:02 : 12 projets, 48 tâches et 1 transaction.',
    );
  });

  it('prend la date du fichier quand le nom ne la donne pas', () => {
    const now = new Date();
    const text = describeCandidate({ ...candidate, fileName: 'copie.db', stamp: null, modifiedMs: now.getTime() });
    expect(text).toMatch(/^Sauvegarde d'aujourd'hui à \d{2}:\d{2} : /);
    expect(describeCandidate({ ...candidate, stamp: null, projects: 0, tasks: 1 })).toBe(
      'cockpit_2026-09-21_090200_auto.db : 0 projet, 1 tâche et 1 transaction.',
    );
  });

  it('lit l’horodatage des noms de sauvegarde', () => {
    expect(parseBackupStamp('2026-09-21_090200')).toEqual(new Date(2026, 8, 21, 9, 2, 0));
    expect(parseBackupStamp('pas une date')).toBeNull();
  });

  it('affiche tels quels les messages déjà rédigés par l’app native', () => {
    expect(humanizeError(new UserError('Ce fichier est endommagé.'))).toBe('Ce fichier est endommagé.');
    expect(humanizeError(new Error('disk I/O error'))).toBe('Une erreur est survenue : disk I/O error');
  });
});

describe('données : base reprise au démarrage', () => {
  it('dit quelle sauvegarde a été reprise', () => {
    expect(recoveryMessage({ restoredFrom: 'cockpit_2026-11-25_212740_auto.db', stamp: '2026-11-25_212740', keptIn: 'backups/abimee_2026-11-26_090000' })).toBe(
      'Cockpit a repris ta sauvegarde du 25 nov. 2026 à 21:27.',
    );
    expect(recoveryMessage({ restoredFrom: 'cockpit_x.db', stamp: null, keptIn: '' })).toBe('Cockpit a repris la sauvegarde « cockpit_x.db ».');
  });
});
