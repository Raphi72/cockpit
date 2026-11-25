import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/core/db/types';
import { startNotificationScheduler, type Ticker } from '@/domains/notifications/scheduler';
import { AUTOSTART_UNAVAILABLE, shouldEnableAutostartByDefault } from '@/domains/presence/model';
import type { NewTaskInput } from '@/domains/tasks/model';
import { insertTaskStatement } from '@/domains/tasks/repository';
import { createTestDb } from './support/test-db';

const TODAY = '2026-11-25';
const NOW = '2026-11-25T06:00:00.000Z';

describe('démarrage avec Windows', () => {
  it('est activé d’office une seule fois, et seulement dans l’app installée', () => {
    const installed = { available: true, enabled: false };
    // Premier lancement de l'app installée : jamais décidé.
    expect(shouldEnableAutostartByDefault(installed, null)).toBe(true);
    // Déjà décidé (activé d'office, ou coupé dans Paramètres) : on n'y touche plus.
    expect(shouldEnableAutostartByDefault(installed, true)).toBe(false);
    expect(shouldEnableAutostartByDefault({ available: true, enabled: true }, true)).toBe(false);
    // En développement et dans le navigateur, le réglage n'existe pas.
    expect(shouldEnableAutostartByDefault(AUTOSTART_UNAVAILABLE, null)).toBe(false);
  });
});

/** Une tâche prévue aujourd'hui : de quoi remplir le résumé du matin, et rien d'autre à notifier. */
async function setup(): Promise<Db> {
  const { db } = createTestDb();
  const task: NewTaskInput = {
    title: 'Appeler la banque',
    projectId: null,
    scheduledDate: TODAY,
    dueDate: null,
    priority: 1,
    estimateMin: null,
    notes: null,
  };
  await db.batch([insertTaskStatement('t1', task, NOW)]);
  return db;
}

/** Battement déclenché à la main, à la place de la minuterie ou de l'événement natif. */
function manualTicker() {
  let onTick: (() => void) | null = null;
  const stop = vi.fn();
  const ticker: Ticker = (callback) => {
    onTick = callback;
    return stop;
  };
  return { ticker, stop, tick: () => onTick?.() };
}

const SUMMARY = { title: 'Mercredi 25 novembre', body: '1 tâche aujourd’hui' };

/** Laisse la vérification en cours (asynchrone) aller au bout. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

describe('planificateur des notifications', () => {
  beforeEach(() => {
    // Seule l'horloge est simulée : les minuteries restent réelles.
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const clock = (hours: number, minutes: number) => vi.setSystemTime(new Date(2026, 10, 25, hours, minutes));

  it('à l’ouverture de la fenêtre, n’envoie pas le résumé : le tableau de bord est à l’écran', async () => {
    const db = await setup();
    const send = vi.fn(async (_notification: { title: string; body: string }) => undefined);
    const { ticker } = manualTicker();
    clock(9, 0);

    const stop = startNotificationScheduler(db, send, { ticker });
    await settle();
    expect(send).not.toHaveBeenCalled();
    stop();
  });

  it('lancé caché avec Windows après 8 h, fait tout de suite la tournée du matin, résumé compris', async () => {
    const db = await setup();
    const send = vi.fn(async (_notification: { title: string; body: string }) => undefined);
    const { ticker, tick } = manualTicker();
    clock(9, 0);

    const stop = startNotificationScheduler(db, send, { ticker, atLaunch: false });
    await settle();
    expect(send.mock.calls).toEqual([[SUMMARY]]);

    // Une seule tournée par jour.
    clock(9, 1);
    tick();
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    stop();
  });

  it('lancé caché avant 8 h, attend 8 h pour la tournée du matin', async () => {
    const db = await setup();
    const send = vi.fn(async (_notification: { title: string; body: string }) => undefined);
    const { ticker, tick } = manualTicker();
    clock(7, 30);

    const stop = startNotificationScheduler(db, send, { ticker, atLaunch: false });
    await settle();
    expect(send).not.toHaveBeenCalled();

    clock(8, 0);
    tick();
    await settle();
    expect(send.mock.calls).toEqual([[SUMMARY]]);
    stop();
  });

  it('s’arrête avec son battement', async () => {
    const db = await setup();
    const send = vi.fn(async (_notification: { title: string; body: string }) => undefined);
    const { ticker, stop: stopTicker, tick } = manualTicker();
    clock(7, 30);

    const stop = startNotificationScheduler(db, send, { ticker, atLaunch: false });
    await settle();
    stop();
    expect(stopTicker).toHaveBeenCalledTimes(1);

    // Un battement en retard ne déclenche plus rien.
    clock(8, 0);
    tick();
    await settle();
    expect(send).not.toHaveBeenCalled();
  });
});
