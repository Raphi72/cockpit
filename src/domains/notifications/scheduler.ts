import { nowTimestamp } from '@/core/dates';
import type { Db } from '@/core/db';
import { momentOf, nextRoundDay, roundFor } from './model';
import { runNotifications, type SendNotification } from './service';

/** Une vérification par minute : un rendez-vous est annoncé à la minute près. */
export const CHECK_EVERY_MS = 60_000;

/**
 * Vérifie les notifications à l'ouverture, puis chaque minute tant que Cockpit est ouvert (même réduit).
 * Renvoie la fonction qui l'arrête.
 */
export function startNotificationScheduler(db: Db, send: SendNotification): () => void {
  let lastRoundDay: string | null = null;
  let running = false;
  let stopped = false;

  const check = async (atLaunch: boolean) => {
    if (running || stopped) return;
    running = true;
    try {
      const moment = momentOf(new Date());
      const round = roundFor(moment, lastRoundDay, atLaunch);
      lastRoundDay = nextRoundDay(moment, lastRoundDay, round);
      await runNotifications(db, { moment, round, now: nowTimestamp() }, send);
    } catch (error) {
      // Une vérification ratée ne doit rien bloquer : la suivante réessaiera.
      console.error('Notifications :', error);
    } finally {
      running = false;
    }
  };

  void check(true);
  const timer = setInterval(() => void check(false), CHECK_EVERY_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
